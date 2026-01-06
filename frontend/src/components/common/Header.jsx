import PropTypes from 'prop-types';
import '../../styles/components/Header.css';

const Header = ({ title = 'Kubrick' }) => {
    return (
        <header className='app-header'>
            <div className='header-logo'>
                <span className='header-title'>{title}</span>
            </div>
        </header>
    );
};

Header.propTypes = {
    title: PropTypes.string,
};

export default Header;
