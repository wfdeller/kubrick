const API_BASE = '/api';

const handleResponse = async (response) => {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.errors?.[0]?.detail || `HTTP error ${response.status}`;
        throw new Error(message);
    }
    return response.json();
};

export const fetchRecordings = async ({ search, sort, page = 1, pageSize = 20 }) => {
    const params = new URLSearchParams();

    if (search) {
        params.set('filter[search]', search);
    }
    if (sort) {
        params.set('sort', sort);
    }
    params.set('page[number]', page);
    params.set('page[size]', pageSize);

    const response = await fetch(`${API_BASE}/recordings?${params}`, {
        headers: {
            Accept: 'application/vnd.api+json',
        },
    });

    return handleResponse(response);
};

export const fetchRecording = async (id) => {
    const response = await fetch(`${API_BASE}/recordings/${id}`, {
        headers: {
            Accept: 'application/vnd.api+json',
        },
    });

    return handleResponse(response);
};

export const createRecording = async (data) => {
    const response = await fetch(`${API_BASE}/recordings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify(data),
    });

    return handleResponse(response);
};

export const updateRecording = async (id, data) => {
    const response = await fetch(`${API_BASE}/recordings/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify(data),
    });

    return handleResponse(response);
};

export const archiveRecording = async (id) => {
    const response = await fetch(`${API_BASE}/recordings/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify({
            data: {
                type: 'recordings',
                id,
                attributes: {
                    status: 'archived',
                },
            },
        }),
    });

    return handleResponse(response);
};

export const getPresignedUploadUrl = async ({ recordingId, contentType, fileSize }) => {
    const response = await fetch(`${API_BASE}/upload/presigned-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordingId, contentType, fileSize }),
    });

    return handleResponse(response);
};

export const completeUpload = async (recordingId, duration) => {
    const response = await fetch(`${API_BASE}/upload/complete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordingId, duration }),
    });

    return handleResponse(response);
};
