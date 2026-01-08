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
                width={500}
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
                                <Text code>john</Text> - Find recordings with "john" in title, description,
                                or recorder
                            </li>
                            <li>
                                <Text code>Location=Studio</Text> - Find recordings where Location contains
                                "Studio"
                            </li>
                            <li>
                                <Text code>john Location=Studio</Text> - Combine text and metadata search
                            </li>
                            <li>
                                <Text code>Project="Big Demo"</Text> - Search metadata with spaces in value
                            </li>
                        </ul>
                    </Paragraph>

                    <Title level={5}>Tips</Title>
                    <Paragraph>
                        <ul>
                            <li>Search is case-insensitive</li>
                            <li>Partial matching is supported</li>
                            <li>Multiple terms use AND logic (all must match)</li>
                        </ul>
                    </Paragraph>
                </Typography>
            </Modal>
        </>
    );
};

export default SearchHelp;
