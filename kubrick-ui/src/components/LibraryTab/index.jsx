import { useState } from 'react';
import { Input, Select, Empty, Spin, Modal, Button, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import VideoCard from './VideoCard';
import VideoPlayer from './VideoPlayer';
import ErrorBoundary from '../common/ErrorBoundary';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { fetchRecordings, archiveRecording } from '../../api/recordings';
import '../../styles/components/LibraryTab.css';

const SORT_OPTIONS = [
    { value: '-createdAt', label: 'Newest First' },
    { value: 'createdAt', label: 'Oldest First' },
    { value: '-duration', label: 'Longest First' },
    { value: 'duration', label: 'Shortest First' },
];

const PAGE_SIZE = 12;

const LibraryTab = () => {
    const queryClient = useQueryClient();
    const { recorderName } = usePreferencesStore();
    const [filterName, setFilterName] = useState(recorderName);
    const [sort, setSort] = useState('-createdAt');
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);

    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
        queryKey: ['recordings', filterName, sort],
        queryFn: ({ pageParam = 1 }) =>
            fetchRecordings({ recorderName: filterName, sort, page: pageParam, pageSize: PAGE_SIZE }),
        getNextPageParam: (lastPage, allPages) => {
            const totalCount = lastPage.meta?.totalCount || 0;
            const loadedCount = allPages.reduce((sum, page) => sum + (page.data?.length || 0), 0);
            return loadedCount < totalCount ? allPages.length + 1 : undefined;
        },
        initialPageParam: 1,
    });

    // Flatten all pages into a single array
    const recordings = data?.pages?.flatMap((page) => page.data) || [];

    const handlePlay = (recording) => {
        setSelectedVideo(recording);
        setIsPlayerOpen(true);
    };

    const handleArchive = async (recording) => {
        try {
            await archiveRecording(recording.id);
            message.success('Recording archived');
            refetch();
        } catch (err) {
            console.error('Archive failed:', err);
            message.error('Failed to archive recording');
        }
    };

    const handleClosePlayer = () => {
        setIsPlayerOpen(false);
        setSelectedVideo(null);
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['recordings'] });
    };

    const totalCount = data?.pages?.[0]?.meta?.totalCount || 0;

    return (
        <div className='library-tab'>
            <div className='library-filters'>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder='Filter by recorder name'
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className='filter-input'
                    allowClear
                />
                <Select value={sort} onChange={setSort} options={SORT_OPTIONS} className='sort-select' />
                <Button icon={<ReloadOutlined />} onClick={handleRefresh} title='Refresh' />
            </div>

            {totalCount > 0 && (
                <div className='library-count'>
                    Showing {recordings.length} of {totalCount} recordings
                </div>
            )}

            {isLoading && (
                <div className='library-loading'>
                    <Spin size='large' />
                </div>
            )}

            {error && (
                <div className='library-error'>
                    <p>Failed to load recordings: {error.message}</p>
                </div>
            )}

            {!isLoading && !error && recordings.length === 0 && (
                <Empty
                    description={filterName ? `No recordings found for "${filterName}"` : 'No recordings yet'}
                    className='library-empty'
                />
            )}

            {!isLoading && !error && recordings.length > 0 && (
                <>
                    <div className='video-grid'>
                        {recordings.map((recording) => (
                            <VideoCard
                                key={recording.id}
                                recording={recording}
                                onPlay={handlePlay}
                                onArchive={handleArchive}
                            />
                        ))}
                    </div>

                    {hasNextPage && (
                        <div className='load-more-container'>
                            <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage} size='large'>
                                {isFetchingNextPage ? 'Loading...' : 'Load More'}
                            </Button>
                        </div>
                    )}
                </>
            )}

            <Modal
                open={isPlayerOpen}
                onCancel={handleClosePlayer}
                footer={null}
                width={900}
                centered
                destroyOnHidden
                className='video-modal'
            >
                {selectedVideo && (
                    <ErrorBoundary title='Playback Error' showError>
                        <VideoPlayer recording={selectedVideo} />
                    </ErrorBoundary>
                )}
            </Modal>
        </div>
    );
};

export default LibraryTab;
