// Define TypeScript interfaces for the API response
interface JobSearchParams {
  query: string;
  page?: number;
  numPages?: number;
  country?: string;
  datePosted?: string;
  language?: string;
  location?: string;
}

interface ApplyOption {
  publisher: string;
  apply_link: string;
  is_direct: boolean;
}

interface JobData {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo: string | null;
  employer_website: string | null;
  job_publisher: string;
  job_employment_type: string;
  job_employment_types: string[];
  job_apply_link: string;
  job_apply_is_direct: boolean;
  apply_options: ApplyOption[];
  job_description?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_posted_at_datetime_utc?: string;
  job_salary_currency?: string;
  job_salary_min?: number;
  job_salary_max?: number;
  job_salary_period?: string;
  [key: string]: any;
}

interface JobSearchResponse {
  status: string;
  request_id: string;
  parameters: JobSearchParams;
  data: JobData[];
}

interface ApiError {
  message: string;
  status: number;
  originalError?: Error;
}

interface CleanJobData {
  employer_logo: string | null;
  job_title: string;
  employer_name: string;
  job_apply_link: string;
  job_employment_type: string;
  job_posted_at_datetime_utc?: string;
}

// Base API configuration with hardcoded API key for demo app
const API_BASE_URL = 'https://jsearch.p.rapidapi.com';
const API_KEY = '06e7be61eamshbe456f20da6724ep1da971jsn23a826117a94';
const API_HOST = 'jsearch.p.rapidapi.com';

const getRequestOptions = (): RequestInit => {
  return {
    method: 'GET',
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': API_HOST
    }
  };
};

const handleApiError = async (error: unknown, response?: Response): Promise<ApiError> => {
  if (response) {
    if (response.status === 401) {
      return {
        message: 'Invalid API key. Please check your API key configuration.',
        status: 401,
        originalError: error instanceof Error ? error : undefined
      };
    }
    
    try {
      const errorData = await response.json();
      return {
        message: errorData.message || `API Error: ${response.statusText}`,
        status: response.status,
        originalError: error instanceof Error ? error : undefined
      };
    } catch {
      return {
        message: `API Error: ${response.statusText}`,
        status: response.status,
        originalError: error instanceof Error ? error : undefined
      };
    }
  }
  
  return {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    status: 500,
    originalError: error instanceof Error ? error : undefined
  };
};

const buildUrl = (endpoint: string, params: Record<string, string | number | undefined>): string => {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });
  
  return url.toString();
};

const fetchEmployerLogo = async (employerName: string): Promise<string | null> => {
  try {
    const searchUrl = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(employerName)}`;
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0 && data[0].logo) {
      return data[0].logo;
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

const enhanceJobData = async (jobs: JobData[]): Promise<JobData[]> => {
  const enhancedJobs = await Promise.all(jobs.map(async (job: JobData) => {
    if (!job.employer_logo) {
      job.employer_logo = await fetchEmployerLogo(job.employer_name);
    }
    
    return job;
  }));
  
  return enhancedJobs;
};

const cleanJobData = (jobs: JobData[]): CleanJobData[] => {
  return jobs.map(job => ({
    employer_logo: job.employer_logo,
    job_title: job.job_title,
    employer_name: job.employer_name,
    job_apply_link: job.job_apply_link,
    job_employment_type: job.job_employment_type,
    job_posted_at_datetime_utc: job.job_posted_at_datetime_utc
  }));
};

export const searchJobsFormatted = async (
  jobTitle: string, 
  location?: string, 
  page: number = 1, 
  numPages: number = 1,
  country: string = 'in',
  datePosted: string = 'all'
): Promise<string> => {
  try {
    let query = jobTitle;
    if (location) {
      query = `${jobTitle} in ${location}`;
    }
    
    const params = {
      query,
      page,
      num_pages: numPages,
      country,
      date_posted: datePosted,
      language: 'en'
    };
    
    const url = buildUrl('/search', params);
    const options = getRequestOptions();
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const apiError = await handleApiError(new Error(`HTTP error ${response.status}`), response);
      throw apiError;
    }
    
    const data = await response.json() as JobSearchResponse;
    const enhancedJobs = await enhanceJobData(data.data);
    const cleanedJobs = cleanJobData(enhancedJobs);
    
    return `/jobdata\n${JSON.stringify(cleanedJobs, null, 2)}`;
    
  } catch (error) {
    console.error('Error in searchJobsFormatted:', error);
    throw error;
  }
};

export const searchJobs = async (
  jobTitle: string, 
  location?: string, 
  page: number = 1, 
  numPages: number = 1,
  country: string = 'in',
  datePosted: string = 'all'
): Promise<JobSearchResponse> => {
  try {
    let query = jobTitle;
    if (location) {
      query = `${jobTitle} in ${location}`;
    }
    
    const params = {
      query,
      page,
      num_pages: numPages,
      country,
      date_posted: datePosted,
      language: 'en'
    };
    
    const url = buildUrl('/search', params);
    const options = getRequestOptions();
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const apiError = await handleApiError(new Error(`HTTP error ${response.status}`), response);
      throw apiError;
    }
    
    const data = await response.json() as JobSearchResponse;
    data.data = await enhanceJobData(data.data);
    
    return data;
  } catch (error) {
    console.error('Error in searchJobs:', error);
    throw error;
  }
};

export const getJobDetails = async (jobId: string): Promise<any> => {
  try {
    const url = buildUrl('/job-details', { job_id: jobId });
    const options = getRequestOptions();
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const apiError = await handleApiError(new Error(`HTTP error ${response.status}`), response);
      throw apiError;
    }
    
    const apiResponse = await response.json();
    
    if (apiResponse.status === 'success' && apiResponse.data.length > 0) {
      apiResponse.data = await enhanceJobData(apiResponse.data);
    }
    
    return apiResponse;
  } catch (error) {
    console.error('Error fetching job details:', error);
    throw error;
  }
};

export default {
  searchJobs,
  searchJobsFormatted,
  getJobDetails
};