import { useState } from 'react';
import { Button, Modal, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const SearchHelp = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <Button
                type='text'
                icon={<QuestionCircleOutlined />}
                onClick={() => setIsOpen(true)}
                title='Search Help'
            />
            <Modal
                title='Search Help'
                open={isOpen}
                onCancel={() => setIsOpen(false)}
                footer={null}
                width={800}
            >
                <Typography>
                    <Title level={5}>Text Search</Title>
                    <Paragraph>
                        Type any text to search across <Text code>title</Text>,{' '}
                        <Text code>description</Text>, and <Text code>recorder name</Text>.
                    </Paragraph>

                    <Title level={5}>Metadata Search</Title>
                    <Paragraph>
                        Use <Text code>key=value</Text> to search metadata fields. For values with spaces,
                        use quotes: <Text code>key="value with spaces"</Text>
                    </Paragraph>

                    <Title level={5}>Examples</Title>
                    <Paragraph>
                        <ul>
                            <li>
                                <Text code>demo</Text> - Find recordings with "demo" in title, description,
                                or recorder name
                            </li>
                            <li>
                                <Text code>Location=Austin</Text> - Find recordings where Location contains
                                "Austin"
                            </li>
                            <li>
                                <Text code>Location="New York"</Text> - Search Location with spaces in value
                            </li>
                            <li>
                                <Text code>interview Location=Austin</Text> - Combine text and metadata
                                search
                            </li>
                        </ul>
                    </Paragraph>

                    <Title level={5}>Tips</Title>
                    <Paragraph>
                        <ul>
                            <li>Search is case-insensitive</li>
                            <li>Partial matching is supported</li>
                            <li>Multiple terms use AND logic (all must match)</li>
                            <li>
                                Metadata keys cannot contain spaces (use <Text code>DayOfWeek</Text> not{' '}
                                <Text code>Day of Week</Text>)
                            </li>
                        </ul>
                    </Paragraph>
                </Typography>
            </Modal>
        </>
    );
};

export default SearchHelp;
