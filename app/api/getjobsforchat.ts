// Define TypeScript interfaces for the API response
interface JobSearchParams {
  query: string;
  page?: number;
  numPages?: number;
  country?: string;
  datePosted?: string;
  language?: string;
  location?: string;
  website?: string;
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

interface GoogleSearchResult {
  title: string;
  link: string;
  snippet?: string;
  displayLink?: string;
  formattedUrl?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchResult[];
}

// Google Custom Search API configuration
const GOOGLE_API_KEY = "AIzaSyB0gjFwtAbgpNiONdNcxU6HHP0BdYIYw6o";
const SEARCH_ENGINE_ID = "154208f4c3d874439";
const GOOGLE_SEARCH_BASE_URL = "https://www.googleapis.com/customsearch/v1";

// Job site configurations in priority order (Herkey first)
const JOB_SITES = [
  {
    name: 'herkey',
    site: 'site:herkey.com',
    publisher: 'Herkey',
    priority: 1,
    isDirect: true
  },
  {
    name: 'naukri',
    site: 'site:naukri.com',
    publisher: 'Naukri',
    priority: 2,
    isDirect: false
  },
  {
    name: 'indeed',
    site: 'site:indeed.com',
    publisher: 'Indeed',
    priority: 3,
    isDirect: false
  },
  {
    name: 'linkedin',
    site: 'site:linkedin.com/jobs',
    publisher: 'LinkedIn',
    priority: 4,
    isDirect: true
  },
  {
    name: 'glassdoor',
    site: 'site:glassdoor.com',
    publisher: 'Glassdoor',
    priority: 5,
    isDirect: true
  },
  {
    name: 'monster',
    site: 'site:monster.com',
    publisher: 'Monster',
    priority: 6,
    isDirect: true
  },
  {
    name: 'shine',
    site: 'site:shine.com',
    publisher: 'Shine',
    priority: 7,
    isDirect: true
  }
];

class GoogleJobSearcher {
  private readonly apiKey: string;
  private readonly searchEngineId: string;

  constructor() {
    this.apiKey = GOOGLE_API_KEY;
    this.searchEngineId = SEARCH_ENGINE_ID;
  }

  /**
   * Create direct Herkey job entry
   */
  private createHerkeyJob(jobTitle: string, location?: string): JobData {
    // Create Herkey search URL with job title as keyword
    const encodedJobTitle = encodeURIComponent(jobTitle);
    let herkeyUrl = `https://www.herkey.com/jobs/search?keyword=${encodedJobTitle}`;
    
    if (location) {
      const encodedLocation = encodeURIComponent(location);
      herkeyUrl += `&location=${encodedLocation}`;
    }

    return {
      job_id: `herkey_${Date.now()}`,
      job_title: jobTitle,
      employer_name: 'Herkey',
      employer_logo: null,
      employer_website: 'https://www.herkey.com',
      job_publisher: 'Herkey',
      job_employment_type: 'Full-time',
      job_employment_types: ['Full-time'],
      job_apply_link: herkeyUrl,
      job_apply_is_direct: true,
      apply_options: [{
        publisher: 'Herkey',
        apply_link: herkeyUrl,
        is_direct: true
      }],
      job_description: `Search for ${jobTitle} jobs on Herkey`,
      job_city: location,
      job_state: undefined,
      job_country: 'India',
      job_posted_at_datetime_utc: new Date().toISOString()
    };
  }

  /**
   * Search for jobs on a single website or all websites in priority order
   */
  async searchJobs(
    jobTitle: string, 
    location?: string, 
    page: number = 1,
    specificWebsite?: string
  ): Promise<GoogleSearchResult[]> {
    try {
      if (specificWebsite) {
        if (specificWebsite.toLowerCase() === 'herkey') {
          // For Herkey, we don't need to search - we'll create direct link
          return [];
        }
        
        // Search only on the specified website (excluding Herkey)
        const jobSite = JOB_SITES.find(site => site.name === specificWebsite.toLowerCase());
        if (!jobSite) {
          throw new Error(`Unsupported website: ${specificWebsite}`);
        }
        return await this.searchSingleSite(jobSite, jobTitle, location, page);
      } else {
        // Search all sites except Herkey (we'll add Herkey separately)
        return await this.searchAllSites(jobTitle, location, page);
      }
    } catch (error) {
      console.error('Error searching jobs:', error);
      throw error;
    }
  }

  /**
   * Search all job sites in priority order (excluding Herkey)
   */
  private async searchAllSites(
    jobTitle: string, 
    location?: string, 
    page: number = 1
  ): Promise<GoogleSearchResult[]> {
    const allResults: GoogleSearchResult[] = [];
    
    // Filter out Herkey and sort remaining sites by priority
    const sortedSites = JOB_SITES
      .filter(site => site.name !== 'herkey')
      .sort((a, b) => a.priority - b.priority);
    
    for (const jobSite of sortedSites) {
      try {
        const results = await this.searchSingleSite(jobSite, jobTitle, location, 1);
        
        if (results.length > 0) {
          allResults.push(...results);
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error searching ${jobSite.name}:`, error);
        // Continue with other sites even if one fails
      }
    }

    return allResults;
  }

  /**
   * Search a single job site
   */
  private async searchSingleSite(
    jobSite: any,
    jobTitle: string,
    location?: string,
    page: number = 1
  ): Promise<GoogleSearchResult[]> {
    let query = `${jobSite.site} "${jobTitle}" jobs`;
    
    if (location) {
      query += ` "${location}"`;
    }
    
    // Add filters for better results
    query += ' -expired -closed recent';

    const numResults = 5;
    const results = await this.performGoogleSearch(query, numResults);
    
    return this.filterJobResults(results, jobTitle, jobSite.name);
  }

  /**
   * Perform Google Custom Search
   */
  private async performGoogleSearch(query: string, num: number = 10): Promise<GoogleSearchResult[]> {
    const url = new URL(GOOGLE_SEARCH_BASE_URL);
    url.searchParams.append('key', this.apiKey);
    url.searchParams.append('cx', this.searchEngineId);
    url.searchParams.append('q', query);
    url.searchParams.append('num', num.toString());
    url.searchParams.append('dateRestrict', 'm2'); // Results from last 2 months

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Search API error: ${response.status} - ${errorText}`);
    }

    const data: GoogleSearchResponse = await response.json();
    return data.items || [];
  }

  /**
   * Filter and validate job results
   */
  private filterJobResults(
    results: GoogleSearchResult[], 
    jobTitle: string, 
    siteName: string
  ): GoogleSearchResult[] {
    return results.filter(result => {
      const title = result.title.toLowerCase();
      const snippet = (result.snippet || '').toLowerCase();
      const jobTitleLower = jobTitle.toLowerCase();
      
      return this.filterGeneralJobResults(result, jobTitleLower);
    });
  }

  /**
   * Filter results for general job sites
   */
  private filterGeneralJobResults(result: GoogleSearchResult, jobTitleLower: string): boolean {
    const title = result.title.toLowerCase();
    const snippet = (result.snippet || '').toLowerCase();

    // Check if it's actually a job posting
    const isJobPosting = 
      title.includes('job') || 
      title.includes('career') || 
      title.includes('opening') ||
      title.includes('position') ||
      title.includes('hiring') ||
      snippet.includes('apply') ||
      snippet.includes('salary') ||
      snippet.includes('experience') ||
      snippet.includes('qualification');

    // Check relevance to job title
    const isRelevant = 
      title.includes(jobTitleLower) || 
      snippet.includes(jobTitleLower);

    // Exclude unwanted results
    const isNotExcluded = 
      !title.includes('course') &&
      !title.includes('training') &&
      !title.includes('certification') &&
      !snippet.includes('learn') &&
      !snippet.includes('study') &&
      !title.includes('salary guide') &&
      !title.includes('interview questions');

    return isJobPosting && isRelevant && isNotExcluded;
  }

  /**
   * Convert Google search results to JobData format
   */
  convertToJobData(results: GoogleSearchResult[], website?: string, jobTitle?: string, location?: string): JobData[] {
    const jobData: JobData[] = [];
    
    // Always add Herkey as first result (unless specifically searching another website)
    if (!website || website.toLowerCase() === 'herkey') {
      if (jobTitle) {
        jobData.push(this.createHerkeyJob(jobTitle, location));
      }
    }
    
    // Add other job sites results
    const otherJobs = results.map((result, index) => {
      const jobId = this.generateJobId(result.link, index);
      const { employerName, jobTitle: extractedJobTitle } = this.extractJobInfo(result);
      const employmentType = this.extractEmploymentType(result);
      const publisher = this.extractJobPublisher(result.link);
      const isDirect = this.isDirect(result.link);
      
      return {
        job_id: jobId,
        job_title: extractedJobTitle,
        employer_name: employerName,
        employer_logo: null,
        employer_website: this.extractEmployerWebsite(result.link),
        job_publisher: publisher,
        job_employment_type: employmentType,
        job_employment_types: [employmentType],
        job_apply_link: result.link,
        job_apply_is_direct: isDirect,
        apply_options: [{
          publisher: publisher,
          apply_link: result.link,
          is_direct: isDirect
        }],
        job_description: result.snippet,
        job_posted_at_datetime_utc: new Date().toISOString(),
        job_city: this.extractLocation(result).city,
        job_state: this.extractLocation(result).state,
        job_country: 'India' // Default for Indian job sites
      };
    });
    
    jobData.push(...otherJobs);
    return jobData;
  }

  private generateJobId(url: string, index: number): string {
    const hash = url.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return `job_${Math.abs(hash)}_${index}`;
  }

  private extractJobInfo(result: GoogleSearchResult): { employerName: string; jobTitle: string } {
    const title = result.title;
    const displayLink = result.displayLink || '';
    
    let employerName = displayLink.replace('www.', '').split('.')[0];
    employerName = employerName.charAt(0).toUpperCase() + employerName.slice(1);
    
    let jobTitle = title;
    
    // Clean up job title by removing common suffixes
    jobTitle = jobTitle.replace(/\s*-\s*(Naukri\.com|Indeed|LinkedIn|Glassdoor|Monster|Shine|Herkey).*$/i, '');
    jobTitle = jobTitle.replace(/\s*\|\s*.*$/, '');
    jobTitle = jobTitle.replace(/\s*at\s+.*$/i, '');
    jobTitle = jobTitle.replace(/\s*in\s+.*$/i, '');
    
    return { employerName, jobTitle: jobTitle.trim() };
  }

  private extractEmploymentType(result: GoogleSearchResult): string {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    
    if (text.includes('full time') || text.includes('full-time')) return 'Full-time';
    if (text.includes('part time') || text.includes('part-time')) return 'Part-time';
    if (text.includes('contract')) return 'Contract';
    if (text.includes('freelance')) return 'Freelance';
    if (text.includes('intern')) return 'Internship';
    if (text.includes('remote')) return 'Remote';
    if (text.includes('work from home') || text.includes('wfh')) return 'Remote';
    
    return 'Full-time'; // Default
  }

  private extractLocation(result: GoogleSearchResult): { city?: string; state?: string } {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    
    // Common Indian cities
    const cities = ['mumbai', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'pune', 'ahmedabad', 'jaipur', 'surat'];
    const states = ['maharashtra', 'karnataka', 'telangana', 'tamil nadu', 'west bengal', 'gujarat', 'rajasthan'];
    
    const foundCity = cities.find(city => text.includes(city));
    const foundState = states.find(state => text.includes(state));
    
    return {
      city: foundCity ? foundCity.charAt(0).toUpperCase() + foundCity.slice(1) : undefined,
      state: foundState ? foundState.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : undefined
    };
  }

  private extractEmployerWebsite(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      return null;
    }
  }

  private extractJobPublisher(url: string): string {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      if (hostname.includes('herkey.com')) return 'Herkey';
      if (hostname.includes('naukri.com')) return 'Naukri';
      if (hostname.includes('indeed.com')) return 'Indeed';
      if (hostname.includes('linkedin.com')) return 'LinkedIn';
      if (hostname.includes('glassdoor.com')) return 'Glassdoor';
      if (hostname.includes('monster.com')) return 'Monster';
      if (hostname.includes('shine.com')) return 'Shine';
      
      return hostname.replace('www.', '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }

  private isDirect(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      // Herkey, LinkedIn, Glassdoor, Monster, Shine are typically direct
      return hostname.includes('herkey.com') || 
             hostname.includes('linkedin.com') || 
             hostname.includes('glassdoor.com') ||
             hostname.includes('monster.com') ||
             hostname.includes('shine.com');
    } catch {
      return false;
    }
  }
}

const handleApiError = async (error: unknown, response?: Response): Promise<ApiError> => {
  if (response) {
    if (response.status === 401) {
      return {
        message: 'Invalid API key. Please check your Google API key configuration.',
        status: 401,
        originalError: error instanceof Error ? error : undefined
      };
    }
    
    if (response.status === 429) {
      return {
        message: 'Rate limit exceeded. Please try again later.',
        status: 429,
        originalError: error instanceof Error ? error : undefined
      };
    }
    
    try {
      const errorData = await response.json();
      return {
        message: errorData.error?.message || `API Error: ${response.statusText}`,
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
  datePosted: string = 'all',
  website?: string
): Promise<string> => {
  try {
    const searcher = new GoogleJobSearcher();
    const searchResults = await searcher.searchJobs(jobTitle, location, page, website);
    
    // Convert search results to job data, always including Herkey first (unless specific website is requested and it's not Herkey)
    const jobData = searcher.convertToJobData(searchResults, website, jobTitle, location);
    const enhancedJobs = await enhanceJobData(jobData);
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
  datePosted: string = 'all',
  website?: string
): Promise<JobSearchResponse> => {
  try {
    const searcher = new GoogleJobSearcher();
    const searchResults = await searcher.searchJobs(jobTitle, location, page, website);
    
    // Convert search results to job data, always including Herkey first (unless specific website is requested and it's not Herkey)
    const jobData = searcher.convertToJobData(searchResults, website, jobTitle, location);
    const enhancedJobs = await enhanceJobData(jobData);
    
    return {
      status: 'success',
      request_id: `req_${Date.now()}`,
      parameters: {
        query: location ? `${jobTitle} in ${location}` : jobTitle,
        page,
        numPages,
        country,
        datePosted,
        language: 'en',
        location,
        website
      },
      data: enhancedJobs
    };
  } catch (error) {
    console.error('Error in searchJobs:', error);
    throw error;
  }
};

export const getJobDetails = async (jobId: string): Promise<any> => {
  try {
    // For Google search results, we don't have detailed job information
    // This would require additional scraping of individual job pages
    return {
      status: 'success',
      data: [{
        job_id: jobId,
        message: 'Detailed job information requires visiting the job link directly',
        limited_details: true
      }]
    };
  } catch (error) {
    console.error('Error fetching job details:', error);
    throw error;
  }
};

// Utility function to get available job sites
export const getAvailableJobSites = (): string[] => {
  return JOB_SITES.map(site => site.name);
};

export default {
  searchJobs,
  searchJobsFormatted,
  getJobDetails,
  getAvailableJobSites
};