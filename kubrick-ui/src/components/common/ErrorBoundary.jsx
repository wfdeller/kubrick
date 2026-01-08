import { Component } from 'react';
import PropTypes from 'prop-types';
import { Result, Button } from 'antd';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <Result
                    status='error'
                    title={this.props.title || 'Something went wrong'}
                    subTitle={this.props.showError ? this.state.error?.message : 'Please try again or refresh the page.'}
                    extra={[
                        <Button key='retry' type='primary' onClick={this.handleReset}>
                            Try Again
                        </Button>,
                        <Button key='refresh' onClick={() => window.location.reload()}>
                            Refresh Page
                        </Button>,
                    ]}
                />
            );
        }

        return this.props.children;
    }
}

ErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired,
    fallback: PropTypes.node,
    title: PropTypes.string,
    showError: PropTypes.bool,
};

ErrorBoundary.defaultProps = {
    fallback: null,
    title: 'Something went wrong',
    showError: false,
};

export default ErrorBoundary;
