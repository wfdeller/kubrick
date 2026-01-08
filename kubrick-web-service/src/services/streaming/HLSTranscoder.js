import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';
import logger from '../../utils/logger.js';

/**
 * HLS Transcoder - Converts WebM chunks to HLS segments using FFmpeg
 * Runs as a child process, piping WebM data in and producing .ts segments + .m3u8 manifest
 */
class HLSTranscoder extends EventEmitter {
    constructor(streamId, options = {}) {
        super();
        this.streamId = streamId;
        this.options = {
            segmentDuration: options.segmentDuration || 4,
            playlistSize: options.playlistSize || 5, // Number of segments in live playlist
            outputDir: options.outputDir || path.join(os.tmpdir(), 'kubrick-streams', streamId),
            ...options,
        };

        this.process = null;
        this.isRunning = false;
        this.isStopping = false;
        this.segmentCount = 0;
        this.startTime = null;
        this.bytesReceived = 0;
        this.lastSegmentTime = null;
        this.errors = [];
    }

    /**
     * Start the FFmpeg transcoding process
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Transcoder already running');
        }

        // Ensure output directory exists
        await fs.promises.mkdir(this.options.outputDir, { recursive: true });

        const manifestPath = path.join(this.options.outputDir, 'stream.m3u8');
        const segmentPattern = path.join(this.options.outputDir, 'segment_%05d.ts');

        // FFmpeg arguments for live HLS transcoding
        const ffmpegArgs = [
            // Input options - be flexible with input format detection
            '-probesize', '5000000',   // Larger probe size to detect format
            '-analyzeduration', '5000000',
            '-fflags', '+genpts+discardcorrupt',
            '-i', 'pipe:0',            // Read from stdin

            // Video encoding
            '-c:v', 'libx264',         // H.264 codec for broad compatibility
            '-preset', 'veryfast',     // Fast encoding for live streaming
            '-tune', 'zerolatency',    // Minimize latency
            '-profile:v', 'baseline',  // Baseline profile for compatibility
            '-level', '3.1',
            '-b:v', '2500k',           // Video bitrate
            '-maxrate', '2500k',
            '-bufsize', '5000k',

            // Audio encoding
            '-c:a', 'aac',             // AAC audio codec
            '-b:a', '128k',            // Audio bitrate
            '-ar', '44100',            // Sample rate

            // HLS output options
            '-f', 'hls',
            '-hls_time', String(this.options.segmentDuration),
            '-hls_list_size', '0',  // Keep all segments in playlist
            '-hls_flags', 'append_list+split_by_time',
            '-hls_segment_type', 'mpegts',
            '-hls_segment_filename', segmentPattern,

            // Output manifest
            manifestPath,
        ];

        logger.info('Starting FFmpeg transcoder', {
            streamId: this.streamId,
            outputDir: this.options.outputDir,
            args: ffmpegArgs.join(' '),
        });

        this.process = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.isRunning = true;
        this.startTime = Date.now();

        // Handle stdin errors (EPIPE when FFmpeg closes)
        this.process.stdin.on('error', (err) => {
            if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
                logger.debug('FFmpeg stdin closed', { streamId: this.streamId });
            } else {
                logger.error('FFmpeg stdin error', { streamId: this.streamId, error: err.message });
            }
        });

        // Handle stdout (usually empty for this config)
        this.process.stdout.on('data', (data) => {
            logger.debug('FFmpeg stdout', { streamId: this.streamId, data: data.toString() });
        });

        // Handle stderr (FFmpeg logs here)
        this.process.stderr.on('data', (data) => {
            const message = data.toString();

            // Check for segment creation
            if (message.includes('Opening') && message.includes('.ts')) {
                this.segmentCount++;
                this.lastSegmentTime = Date.now();
                this.emit('segment', {
                    streamId: this.streamId,
                    segmentNumber: this.segmentCount,
                    timestamp: this.lastSegmentTime,
                });
            }

            // Log errors
            if (message.toLowerCase().includes('error')) {
                this.errors.push({ time: Date.now(), message });
                logger.error('FFmpeg error', { streamId: this.streamId, message });
            }
        });

        // Handle process exit
        this.process.on('close', (code) => {
            this.isRunning = false;
            logger.info('FFmpeg process exited', { streamId: this.streamId, code });
            this.emit('close', { streamId: this.streamId, code });
        });

        this.process.on('error', (err) => {
            this.isRunning = false;
            this.errors.push({ time: Date.now(), message: err.message });
            logger.error('FFmpeg process error', { streamId: this.streamId, error: err.message });
            this.emit('error', { streamId: this.streamId, error: err });
        });

        // Watch for new segments
        this.startSegmentWatcher();

        return { manifestPath, outputDir: this.options.outputDir };
    }

    /**
     * Write WebM data to FFmpeg stdin
     */
    write(chunk) {
        if (!this.isRunning || !this.process || this.isStopping) {
            // Silently ignore writes after stopping
            return Promise.resolve(false);
        }

        this.bytesReceived += chunk.length;

        return new Promise((resolve) => {
            try {
                if (!this.process.stdin.writable) {
                    resolve(false);
                    return;
                }
                const canWrite = this.process.stdin.write(chunk, (err) => {
                    if (err) {
                        logger.debug('Write error (stream closing)', { streamId: this.streamId });
                        resolve(false);
                    } else {
                        resolve(canWrite);
                    }
                });
            } catch (err) {
                // Handle any synchronous errors
                logger.debug('Write exception (stream closing)', { streamId: this.streamId });
                resolve(false);
            }
        });
    }

    /**
     * Watch output directory for new segments and emit events
     */
    startSegmentWatcher() {
        this.segmentWatcher = fs.watch(this.options.outputDir, (eventType, filename) => {
            if (filename && filename.endsWith('.ts')) {
                const segmentPath = path.join(this.options.outputDir, filename);
                this.emit('segmentReady', {
                    streamId: this.streamId,
                    filename,
                    path: segmentPath,
                });
            } else if (filename === 'stream.m3u8') {
                this.emit('manifestUpdated', {
                    streamId: this.streamId,
                    path: path.join(this.options.outputDir, filename),
                });
            }
        });
    }

    /**
     * Stop the transcoding process gracefully
     */
    async stop() {
        if (!this.isRunning || !this.process || this.isStopping) {
            return;
        }

        this.isStopping = true;
        logger.info('Stopping FFmpeg transcoder', { streamId: this.streamId });

        // Close stdin to signal end of input
        try {
            this.process.stdin.end();
        } catch (err) {
            logger.debug('Error ending stdin', { streamId: this.streamId, error: err.message });
        }

        // Wait for process to finish or timeout
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                }
                resolve();
            }, 5000);

            this.process.on('close', () => {
                clearTimeout(timeout);
                if (this.segmentWatcher) {
                    this.segmentWatcher.close();
                }
                resolve();
            });
        });
    }

    /**
     * Force kill the process
     */
    kill() {
        if (this.process) {
            this.process.kill('SIGKILL');
        }
        if (this.segmentWatcher) {
            this.segmentWatcher.close();
        }
        this.isRunning = false;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            streamId: this.streamId,
            isRunning: this.isRunning,
            startTime: this.startTime,
            duration: this.startTime ? Date.now() - this.startTime : 0,
            bytesReceived: this.bytesReceived,
            segmentCount: this.segmentCount,
            lastSegmentTime: this.lastSegmentTime,
            errors: this.errors.slice(-10), // Last 10 errors
            outputDir: this.options.outputDir,
        };
    }

    /**
     * Clean up output directory
     */
    async cleanup() {
        try {
            await fs.promises.rm(this.options.outputDir, { recursive: true, force: true });
            logger.info('Cleaned up transcoder output', { streamId: this.streamId });
        } catch (err) {
            logger.error('Failed to cleanup transcoder output', { streamId: this.streamId, error: err.message });
        }
    }
}

export default HLSTranscoder;
