import { useState, useEffect } from 'react';
import UAParser from 'ua-parser-js';

const getSessionInfo = () => {
    const parser = new UAParser();
    const result = parser.getResult();

    return {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        browserName: result.browser.name || 'Unknown',
        browserVersion: result.browser.version || 'Unknown',
        osName: result.os.name || 'Unknown',
        osVersion: result.os.version || 'Unknown',
        screenResolution: `${screen.width}x${screen.height}`,
        language: navigator.language,
        userAgent: navigator.userAgent,
        deviceType: result.device.type || 'desktop',
        deviceMemory: navigator.deviceMemory || null,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        online: navigator.onLine,
        cookiesEnabled: navigator.cookieEnabled,
    };
};

export const useSessionInfo = () => {
    const [sessionInfo, setSessionInfo] = useState(null);
    const [ipAddress, setIpAddress] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Get client-side info immediately
        const clientInfo = getSessionInfo();
        setSessionInfo(clientInfo);

        // Fetch IP address from backend
        const fetchIpAddress = async () => {
            try {
                const response = await fetch('/api/session-info');
                if (response.ok) {
                    const data = await response.json();
                    setIpAddress(data.ipAddress);
                }
            } catch (err) {
                console.warn('Could not fetch IP address:', err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchIpAddress();
    }, []);

    return {
        sessionInfo: sessionInfo ? { ...sessionInfo, ipAddress } : null,
        loading,
        error,
    };
};
