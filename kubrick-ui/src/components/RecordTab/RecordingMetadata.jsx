import PropTypes from 'prop-types';
import { Card, Input } from 'antd';
import { FormOutlined, UserOutlined } from '@ant-design/icons';

const RecordingMetadata = ({
    title,
    recorderName,
    metadata,
    disabled,
    onTitleChange,
    onRecorderNameChange,
    onMetadataFieldChange,
}) => {
    return (
        <Card
            title={
                <span>
                    <FormOutlined style={{ marginRight: 8 }} />
                    Recording Metadata
                </span>
            }
            size='small'
            className='metadata-card'
        >
            <div className='metadata-fields'>
                <div className='metadata-field'>
                    <label>Title (optional)</label>
                    <Input
                        placeholder='Recording title'
                        value={title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        disabled={disabled}
                    />
                </div>
                <div className='metadata-field'>
                    <label>Your Name *</label>
                    <Input
                        prefix={<UserOutlined />}
                        placeholder='Enter your name'
                        value={recorderName}
                        onChange={(e) => onRecorderNameChange(e.target.value)}
                        disabled={disabled}
                    />
                </div>
                {Object.entries(metadata).map(([key, value]) => (
                    <div className='metadata-field' key={key}>
                        <label>{key}</label>
                        <Input
                            type='text'
                            placeholder={key}
                            value={value}
                            onChange={(e) => onMetadataFieldChange(key, e.target.value)}
                            disabled={disabled}
                        />
                    </div>
                ))}
            </div>
        </Card>
    );
};

RecordingMetadata.propTypes = {
    title: PropTypes.string.isRequired,
    recorderName: PropTypes.string.isRequired,
    metadata: PropTypes.object.isRequired,
    disabled: PropTypes.bool.isRequired,
    onTitleChange: PropTypes.func.isRequired,
    onRecorderNameChange: PropTypes.func.isRequired,
    onMetadataFieldChange: PropTypes.func.isRequired,
};

export default RecordingMetadata;
