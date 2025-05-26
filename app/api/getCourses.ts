interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: SearchResult[];
}

interface CourseResult {
  title: string;
  platform: string;
  url: string;
}

class GoogleSearchScraper {
  // Hardcoded API credentials - Replace with your actual values
  private readonly API_KEY = "AIzaSyAv0eINGFdlMmMdCB-JsgyJ7C1uDHYMNhQ";
  private readonly SEARCH_ENGINE_ID = "154208f4c3d874439";
  private readonly BASE_URL = "https://www.googleapis.com/customsearch/v1";
  
  /**
   * Search Google for courses related to the given keyword
   * @param keyword - The search term (e.g., "python", "javascript", "react")
   * @returns Promise<CourseResult[] | null> - Array of course results or null if no results found
   */
  async searchCourses(keyword: string): Promise<CourseResult[] | null> {
    try {
      // First, search for YouTube courses specifically
      const youtubeResults = await this.searchYouTubeCourses(keyword);
      
      // Then search for other platform courses
      const otherResults = await this.searchOtherPlatformCourses(keyword);
      
      const allCourses = [...youtubeResults, ...otherResults];
      
      if (allCourses.length === 0) {
        console.log(`No course results found for keyword: ${keyword}`);
        return null;
      }
      
      return allCourses;
    } catch (error) {
      console.error(`Error searching for ${keyword}:`, error);
      return null;
    }
  }

  /**
   * Search specifically for YouTube courses/tutorials
   * @param keyword - The search term
   * @returns Promise<CourseResult[]> - YouTube course results
   */
  private async searchYouTubeCourses(keyword: string): Promise<CourseResult[]> {
    try {
      // Search for specific YouTube courses/tutorials, not just general "courses"
      const searchQuery = `site:youtube.com "${keyword}" tutorial complete course learn full`;
      const url = `${this.BASE_URL}?key=${this.API_KEY}&cx=${this.SEARCH_ENGINE_ID}&q=${encodeURIComponent(searchQuery)}&num=5`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`YouTube search failed: ${response.status} ${response.statusText}`);
      }
      
      const data: GoogleSearchResponse = await response.json();
      
      if (!data.items || data.items.length === 0) {
        return [];
      }
      
      return this.parseYouTubeResults(data.items);
    } catch (error) {
      console.error(`Error searching YouTube for ${keyword}:`, error);
      return [];
    }
  }

  /**
   * Search for courses on other platforms
   * @param keyword - The search term
   * @returns Promise<CourseResult[]> - Other platform course results
   */
  private async searchOtherPlatformCourses(keyword: string): Promise<CourseResult[]> {
    try {
      // Search for specific courses on known platforms
      const platformQueries = [
        `site:coursera.org "${keyword}" course`,
        `site:udemy.com "${keyword}" course`,
        `site:edx.org "${keyword}" course`,
        `site:pluralsight.com "${keyword}" course`,
        `site:codecademy.com "${keyword}" course`,
        `site:freecodecamp.org "${keyword}" course`
      ];
      
      const allResults: CourseResult[] = [];
      
      // Search each platform individually to get specific courses
      for (const query of platformQueries) {
        const url = `${this.BASE_URL}?key=${this.API_KEY}&cx=${this.SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=2`;
        
        try {
          const response = await fetch(url);
          if (response.ok) {
            const data: GoogleSearchResponse = await response.json();
            if (data.items && data.items.length > 0) {
              const courses = this.parseSearchResults(data.items);
              allResults.push(...courses);
            }
          }
        } catch (error) {
          console.error(`Error searching platform with query "${query}":`, error);
        }
      }
      
      return allResults;
    } catch (error) {
      console.error(`Error searching other platforms for ${keyword}:`, error);
      return [];
    }
  }

  /**
   * Parse YouTube search results specifically
   * @param items - Raw search result items from Google API
   * @returns CourseResult[] - Parsed YouTube course results
   */
  private parseYouTubeResults(items: SearchResult[]): CourseResult[] {
    const courses: CourseResult[] = [];
    
    for (const item of items) {
      if (item.link.includes('youtube.com/watch')) {
        // Filter for actual course/tutorial content
        const title = this.cleanTitle(item.title);
        if (this.isLikelyCourseContent(title, item.snippet || '')) {
          courses.push({
            title: title,
            platform: 'YouTube',
            url: item.link
          });
        }
      }
    }
    
    // Return only the best YouTube result to avoid overwhelming with videos
    return courses.slice(0, 1);
  }

  /**
   * Check if content is likely a course/tutorial
   * @param title - Video title
   * @param snippet - Video description snippet
   * @returns boolean - Whether it's likely course content
   */
  private isLikelyCourseContent(title: string, snippet: string): boolean {
    const courseKeywords = [
      'tutorial', 'course', 'learn', 'complete', 'full', 'guide', 
      'beginner', 'basics', 'fundamentals', 'crash course', 'bootcamp',
      'step by step', 'from scratch', 'masterclass'
    ];
    
    const titleLower = title.toLowerCase();
    const snippetLower = snippet.toLowerCase();
    
    return courseKeywords.some(keyword => 
      titleLower.includes(keyword) || snippetLower.includes(keyword)
    );
  }

  /**
   * Parse Google search results and extract course information
   * @param items - Raw search result items from Google API
   * @returns CourseResult[] - Parsed course results
   */
  private parseSearchResults(items: SearchResult[]): CourseResult[] {
    const courses: CourseResult[] = [];
    const platformMap: { [key: string]: string } = {
      'coursera.org': 'Coursera',
      'udemy.com': 'Udemy',
      'edx.org': 'edX',
      'khanacademy.org': 'Khan Academy',
      'linkedin.com/learning': 'LinkedIn Learning',
      'pluralsight.com': 'Pluralsight',
      'codecademy.com': 'Codecademy',
      'freecodecamp.org': 'freeCodeCamp',
      'skillshare.com': 'Skillshare'
    };

    for (const item of items) {
      // Extract platform from URL
      const platform = this.extractPlatform(item.link, platformMap);
      
      if (platform) {
        courses.push({
          title: this.cleanTitle(item.title),
          platform: platform,
          url: item.link
        });
      }
    }

    return courses;
  }

  /**
   * Extract platform name from URL
   * @param url - The course URL
   * @param platformMap - Mapping of domains to platform names
   * @returns string | null - Platform name or null if not recognized
   */
  private extractPlatform(url: string, platformMap: { [key: string]: string }): string | null {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      for (const [domain, platformName] of Object.entries(platformMap)) {
        if (hostname.includes(domain)) {
          return platformName;
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clean and format the course title
   * @param title - Raw title from search results
   * @returns string - Cleaned title
   */
  private cleanTitle(title: string): string {
    // Remove common suffixes and clean up the title
    return title
      .replace(/\s*-\s*(Coursera|Udemy|edX|Khan Academy|LinkedIn Learning|Pluralsight|Codecademy|freeCodeCamp|YouTube|Skillshare).*$/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .replace(/\s*-\s*YouTube.*$/i, '')
      .trim();
  }

  /**
   * Format results for display as requested
   * @param keyword - The search keyword
   * @param courses - Array of course results
   * @returns string - Formatted output string
   */
  formatResults(keyword: string, courses: CourseResult[]): string {
    if (!courses || courses.length === 0) {
      return '';
    }
    
    let output = `/courses\n`;
    
    for (const course of courses) {
      output += `${course.title}: ${course.platform}: ${course.url}\n`;
    }
    
    return output.trim();
  }
}

// Main function to search and format results
export async function searchCoursesForKeyword(keyword: string): Promise<string> {
  const scraper = new GoogleSearchScraper();
  const courses = await scraper.searchCourses(keyword);
  
  if (!courses) {
    return ''; // Don't pass component if no results found
  }
  
  return scraper.formatResults(keyword, courses);
}

// Example usage function
export async function searchMultipleKeywords(keywords: string[]): Promise<string[]> {
  const results: string[] = [];
  
  for (const keyword of keywords) {
    const result = await searchCoursesForKeyword(keyword);
    if (result) { // Only add if results were found
      results.push(result);
    }
  }
  
  return results;
}