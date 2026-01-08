import { useState } from 'react';
import { Input, Select, Empty, Spin, Modal, Button, Pagination, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import VideoCard from './VideoCard';
import VideoPlayer from './VideoPlayer';
import SearchHelp from './SearchHelp';
import ErrorBoundary from '../common/ErrorBoundary';
import { useDebounce } from '../../hooks/useDebounce';
import { fetchRecordings, archiveRecording } from '../../api/recordings';
import '../../styles/components/LibraryTab.css';

const SORT_OPTIONS = [
    { value: '-createdAt', label: 'Newest First' },
    { value: 'createdAt', label: 'Oldest First' },
];

const PAGE_SIZE = 12;

const LibraryTab = () => {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [sort, setSort] = useState('-createdAt');
    const [page, setPage] = useState(1);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);

    // Debounce search to prevent excessive API calls while typing
    const debouncedSearch = useDebounce(searchQuery, 300);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['recordings', debouncedSearch, sort, page],
        queryFn: () => fetchRecordings({ search: debouncedSearch, sort, page, pageSize: PAGE_SIZE }),
    });

    const recordings = data?.data || [];
    const totalCount = data?.meta?.totalCount || 0;

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

    const handleSortChange = (newSort) => {
        setSort(newSort);
        setPage(1); // Reset to first page when sort changes
    };

    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
        setPage(1); // Reset to first page when search changes
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['recordings'] });
    };

    return (
        <div className='library-tab'>
            <div className='library-filters'>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder='Search recordings...'
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className='filter-input'
                    allowClear
                />
                <SearchHelp />
                <Select value={sort} onChange={handleSortChange} options={SORT_OPTIONS} className='sort-select' />
                <Button icon={<ReloadOutlined />} onClick={handleRefresh} title='Refresh' />
            </div>

            {totalCount > 0 && (
                <div className='library-count'>
                    Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} recordings
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
                    description={searchQuery ? `No recordings found for "${searchQuery}"` : 'No recordings yet'}
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

                    {totalCount > PAGE_SIZE && (
                        <div className='pagination-container'>
                            <Pagination
                                current={page}
                                total={totalCount}
                                pageSize={PAGE_SIZE}
                                onChange={handlePageChange}
                                showSizeChanger={false}
                                showQuickJumper={totalCount > PAGE_SIZE * 5}
                            />
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
