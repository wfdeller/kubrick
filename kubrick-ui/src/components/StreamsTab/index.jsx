import { useState, useEffect } from 'react';
import { Card, Table, Tag, Statistic, Row, Col, Alert, Button, Empty, Spin, Tooltip } from 'antd';
import {
    ReloadOutlined,
    VideoCameraOutlined,
    TeamOutlined,
    CloudServerOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import '../../styles/components/StreamsTab.css';

const formatDuration = (ms) => {
    if (!ms) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const StreamsTab = () => {
    const { isLiveStreamingEnabled, isLoading: featuresLoading } = useFeatureFlags();
    const [autoRefresh, setAutoRefresh] = useState(false);

    const {
        data: streamStatus,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: ['streams', 'status'],
        queryFn: async () => {
            const response = await fetch('/api/streams/status');
            if (!response.ok) {
                if (response.status === 404) {
                    return null; // Feature disabled
                }
                throw new Error('Failed to fetch stream status');
            }
            const result = await response.json();
            return result.data.attributes;
        },
        refetchInterval: autoRefresh ? 5000 : false, // Refresh every 5 seconds when enabled
        enabled: isLiveStreamingEnabled,
    });

    // Feature disabled state
    if (!featuresLoading && !isLiveStreamingEnabled) {
        return (
            <div className='streams-tab'>
                <Alert
                    message='Live Streaming Disabled'
                    description='Live streaming is not enabled on this server. Set LIVE_STREAMING_ENABLED=true in the backend environment to enable this feature.'
                    type='info'
                    showIcon
                    className='feature-disabled-alert'
                />
            </div>
        );
    }

    if (isLoading || featuresLoading) {
        return (
            <div className='streams-tab streams-loading'>
                <Spin size='large' />
                <p>Loading stream status...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className='streams-tab'>
                <Alert
                    message='Error Loading Streams'
                    description={error.message}
                    type='error'
                    showIcon
                    action={
                        <Button size='small' onClick={() => refetch()}>
                            Retry
                        </Button>
                    }
                />
            </div>
        );
    }

    const streams = streamStatus?.streams || [];
    const activeStreams = streams.filter((s) => s.status === 'live');

    const columns = [
        {
            title: 'Recording',
            dataIndex: 'recordingId',
            key: 'recordingId',
            render: (id) => <code>{id?.slice(-8)}</code>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => {
                const colors = {
                    live: 'green',
                    starting: 'blue',
                    stopping: 'orange',
                    ended: 'default',
                    error: 'red',
                };
                const icons = {
                    live: <SyncOutlined spin />,
                    starting: <SyncOutlined spin />,
                    error: <CloseCircleOutlined />,
                    ended: <CheckCircleOutlined />,
                };
                return (
                    <Tag color={colors[status]} icon={icons[status]}>
                        {status?.toUpperCase()}
                    </Tag>
                );
            },
        },
        {
            title: 'Duration',
            dataIndex: 'duration',
            key: 'duration',
            render: (duration) => formatDuration(duration),
        },
        {
            title: 'Viewers',
            dataIndex: 'viewerCount',
            key: 'viewerCount',
            render: (count) => (
                <span>
                    <TeamOutlined style={{ marginRight: 4 }} />
                    {count}
                </span>
            ),
        },
        {
            title: 'Segments',
            dataIndex: 'segmentsUploaded',
            key: 'segmentsUploaded',
        },
        {
            title: 'Data Uploaded',
            dataIndex: 'bytesUploaded',
            key: 'bytesUploaded',
            render: (bytes) => formatBytes(bytes),
        },
        {
            title: 'Transcoder',
            dataIndex: 'transcoder',
            key: 'transcoder',
            render: (transcoder) => {
                if (!transcoder) return <Tag>N/A</Tag>;
                return (
                    <Tooltip
                        title={
                            <div>
                                <div>Segments: {transcoder.segmentCount}</div>
                                <div>Received: {formatBytes(transcoder.bytesReceived)}</div>
                                {transcoder.errors?.length > 0 && <div>Errors: {transcoder.errors.length}</div>}
                            </div>
                        }
                    >
                        <Tag color={transcoder.isRunning ? 'green' : 'default'}>
                            {transcoder.isRunning ? 'Running' : 'Stopped'}
                        </Tag>
                    </Tooltip>
                );
            },
        },
    ];

    return (
        <div className='streams-tab'>
            <div className='streams-header'>
                <h2>Live Streams Monitor</h2>
                <div className='streams-actions'>
                    <Button
                        type={autoRefresh ? 'primary' : 'default'}
                        icon={<SyncOutlined spin={autoRefresh} />}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                        Refresh
                    </Button>
                </div>
            </div>

            <Row gutter={16} className='streams-stats'>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title='Active Streams'
                            value={streamStatus?.activeStreams || 0}
                            prefix={<VideoCameraOutlined />}
                            valueStyle={{ color: activeStreams.length > 0 ? '#52c41a' : undefined }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title='Total Viewers'
                            value={streamStatus?.totalViewers || 0}
                            prefix={<TeamOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title='Segments Uploaded'
                            value={streamStatus?.totalSegmentsUploaded || 0}
                            prefix={<CloudServerOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title='Data Uploaded'
                            value={formatBytes(streamStatus?.totalBytesUploaded || 0)}
                            prefix={<CloudServerOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Card title='Stream Sessions' className='streams-table-card'>
                {streams.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description='No streams yet. Start a live recording to see streams here.'
                    />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={streams}
                        rowKey='recordingId'
                        pagination={false}
                        size='small'
                        rowClassName={(record) => (record.status === 'live' ? 'stream-row-live' : '')}
                    />
                )}
            </Card>
        </div>
    );
};

export default StreamsTab;
