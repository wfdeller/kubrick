import { useState } from 'react';
import { Tabs, Button, Modal, Tooltip, Descriptions, Tag, Spin } from 'antd';
import { InfoCircleOutlined, GlobalOutlined } from '@ant-design/icons';
import Header from './components/common/Header';
import RecordTab from './components/RecordTab';
import LibraryTab from './components/LibraryTab';
import StreamsTab from './components/StreamsTab';
import { useSessionInfo } from './hooks/useSessionInfo';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import './styles/components/App.css';

const App = () => {
    const [activeTab, setActiveTab] = useState('record');
    const [sessionModalOpen, setSessionModalOpen] = useState(false);
    const { sessionInfo, loading: sessionLoading } = useSessionInfo();
    const { isLiveStreamingEnabled } = useFeatureFlags();

    const tabItems = [
        {
            key: 'record',
            label: 'Record',
            children: <RecordTab />,
        },
        {
            key: 'library',
            label: 'Library',
            children: <LibraryTab />,
        },
        // Only show Streams tab when live streaming is enabled
        ...(isLiveStreamingEnabled
            ? [
                  {
                      key: 'streams',
                      label: 'Streams',
                      children: <StreamsTab />,
                  },
              ]
            : []),
    ];

    const sessionInfoButton = (
        <>
            <Tooltip title='View Session Information'>
                <Button
                    type='text'
                    icon={<InfoCircleOutlined />}
                    onClick={() => setSessionModalOpen(true)}
                    className='session-info-button'
                >
                    Session Info
                </Button>
            </Tooltip>

            <Modal
                title={
                    <span>
                        <GlobalOutlined style={{ marginRight: 8 }} />
                        Session Information
                    </span>
                }
                open={sessionModalOpen}
                onCancel={() => setSessionModalOpen(false)}
                footer={null}
                width={800}
                styles={{ body: { minHeight: 400 } }}
            >
                {sessionLoading ? (
                    <div className='session-loading'>
                        <Spin size='small' />
                        <span>Loading session info...</span>
                    </div>
                ) : sessionInfo ? (
                    <Descriptions column={{ xs: 1, sm: 2 }} size='small' layout='vertical'>
                        <Descriptions.Item label='IP Address'>
                            <Tag color={sessionInfo.ipAddress ? 'blue' : 'default'}>
                                {sessionInfo.ipAddress || 'Unknown'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label='Timezone'>{sessionInfo.timezone}</Descriptions.Item>
                        <Descriptions.Item label='Browser'>
                            {sessionInfo.browserName} {sessionInfo.browserVersion}
                        </Descriptions.Item>
                        <Descriptions.Item label='Operating System'>
                            {sessionInfo.osName} {sessionInfo.osVersion}
                        </Descriptions.Item>
                        <Descriptions.Item label='Screen'>{sessionInfo.screenResolution}</Descriptions.Item>
                        <Descriptions.Item label='Language'>{sessionInfo.language}</Descriptions.Item>
                        <Descriptions.Item label='Device Type'>
                            <Tag>{sessionInfo.deviceType}</Tag>
                        </Descriptions.Item>
                        {sessionInfo.deviceMemory && (
                            <Descriptions.Item label='Memory'>{sessionInfo.deviceMemory} GB</Descriptions.Item>
                        )}
                        {sessionInfo.hardwareConcurrency && (
                            <Descriptions.Item label='CPU Cores'>{sessionInfo.hardwareConcurrency}</Descriptions.Item>
                        )}
                        <Descriptions.Item label='Online'>
                            <Tag color={sessionInfo.online ? 'success' : 'error'}>
                                {sessionInfo.online ? 'Yes' : 'No'}
                            </Tag>
                        </Descriptions.Item>
                    </Descriptions>
                ) : (
                    <span>No session information available</span>
                )}
            </Modal>
        </>
    );

    return (
        <div className='app-container'>
            <Header title='CBP Common Video Recorder' />
            <main className='app-main'>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    size='large'
                    className='app-tabs'
                    tabBarExtraContent={{ right: sessionInfoButton }}
                />
            </main>
        </div>
    );
};

export default App;
