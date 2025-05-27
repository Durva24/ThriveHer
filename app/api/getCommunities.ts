interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: SearchResult[];
}

interface CommunityResult {
  title: string;
  platform: string;
  url: string;
  relevanceScore: number;
}

class GoogleCommunitySearcher {
  // Hardcoded API credentials - Replace with your actual values
  private readonly API_KEY = "AIzaSyB0gjFwtAbgpNiONdNcxU6HHP0BdYIYw6o";
  private readonly SEARCH_ENGINE_ID = "154208f4c3d874439";
  private readonly BASE_URL = "https://www.googleapis.com/customsearch/v1";
  
  /**
   * Search for communities related to the given keyword
   * @param keyword - The search term (e.g., "react", "javascript", "python")
   * @returns Promise<CommunityResult[] | null> - Array of community results or null if no results found
   */
  async searchCommunities(keyword: string): Promise<CommunityResult[] | null> {
    try {
      const allCommunities = await this.searchAllPlatforms(keyword);
      
      if (allCommunities.length === 0) {
        console.log(`No community results found for keyword: ${keyword}`);
        return null;
      }
      
      // Sort by relevance score and return best matches
      const sortedCommunities = allCommunities
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .filter(community => community.relevanceScore >= 0.6); // Only return high-confidence matches
      
      return sortedCommunities.length > 0 ? sortedCommunities : null;
    } catch (error) {
      console.error(`Error searching communities for ${keyword}:`, error);
      return null;
    }
  }

  /**
   * Search for communities across all target platforms
   * @param keyword - The search term
   * @returns Promise<CommunityResult[]> - Community results from all platforms
   */
  private async searchAllPlatforms(keyword: string): Promise<CommunityResult[]> {
    try {
      // More specific search queries with better targeting
      const platformQueries = [
        {
          query: `site:discord.gg OR site:discord.com/invite "${keyword}" OR ${keyword} community server discord`,
          platform: 'Discord'
        },
        {
          query: `site:reddit.com/r/ "${keyword}" OR ${keyword} subreddit community`,
          platform: 'Reddit'
        },
        {
          query: `site:facebook.com/groups "${keyword}" OR ${keyword} facebook group community`,
          platform: 'Facebook'
        },
        {
          query: `site:linkedin.com/groups "${keyword}" OR ${keyword} linkedin group professional`,
          platform: 'LinkedIn'
        },
        {
          query: `site:t.me OR site:telegram.me "${keyword}" OR ${keyword} telegram group channel`,
          platform: 'Telegram'
        }
      ];
      
      const allResults: CommunityResult[] = [];
      
      // Search each platform with delay to avoid rate limiting
      for (let i = 0; i < platformQueries.length; i++) {
        const { query, platform } = platformQueries[i];
        
        try {
          // Add delay between requests
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          const url = `${this.BASE_URL}?key=${this.API_KEY}&cx=${this.SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=5`;
          
          const response = await fetch(url);
          if (response.ok) {
            const data: GoogleSearchResponse = await response.json();
            if (data.items && data.items.length > 0) {
              const communities = this.parseSearchResults(data.items, platform, keyword);
              allResults.push(...communities);
            }
          } else {
            console.warn(`Failed to search ${platform}: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error searching ${platform} for "${keyword}":`, error);
        }
      }
      
      return allResults;
    } catch (error) {
      console.error(`Error searching platforms for ${keyword}:`, error);
      return [];
    }
  }

  /**
   * Parse Google search results and extract community information
   * @param items - Raw search result items from Google API
   * @param expectedPlatform - The platform we expect these results to be from
   * @param keyword - Original search keyword for relevance scoring
   * @returns CommunityResult[] - Parsed community results
   */
  private parseSearchResults(items: SearchResult[], expectedPlatform: string, keyword: string): CommunityResult[] {
    const communities: CommunityResult[] = [];

    for (const item of items) {
      // Verify the result is from the expected platform
      if (this.isValidPlatformUrl(item.link, expectedPlatform)) {
        // Calculate relevance score
        const relevanceScore = this.calculateRelevanceScore(item.title, item.snippet || '', keyword, expectedPlatform);
        
        // Only include if relevance score is above threshold
        if (relevanceScore >= 0.5) {
          communities.push({
            title: this.cleanTitle(item.title, expectedPlatform),
            platform: expectedPlatform,
            url: item.link,
            relevanceScore: relevanceScore
          });
        }
      }
    }

    // Return top 2 results per platform, sorted by relevance
    return communities
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 2);
  }

  /**
   * Calculate relevance score based on keyword matching and content quality
   * @param title - Result title
   * @param snippet - Result description snippet
   * @param keyword - Original search keyword
   * @param platform - Platform name
   * @returns number - Relevance score between 0 and 1
   */
  private calculateRelevanceScore(title: string, snippet: string, keyword: string, platform: string): number {
    const titleLower = title.toLowerCase();
    const snippetLower = snippet.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    let score = 0;
    
    // Keyword matching in title (highest weight)
    if (titleLower.includes(keywordLower)) {
      score += 0.4;
    }
    
    // Keyword matching in snippet
    if (snippetLower.includes(keywordLower)) {
      score += 0.2;
    }
    
    // Community indicators
    const communityKeywords = [
      'community', 'group', 'forum', 'discussion', 'developers', 
      'programming', 'coding', 'support', 'help', 'learn'
    ];
    
    const matchingCommunityKeywords = communityKeywords.filter(word => 
      titleLower.includes(word) || snippetLower.includes(word)
    ).length;
    
    score += Math.min(matchingCommunityKeywords * 0.1, 0.3);
    
    // Platform-specific bonus scoring
    switch (platform) {
      case 'Discord':
        if (titleLower.includes('server') || snippetLower.includes('server')) score += 0.1;
        if (titleLower.includes('discord') || snippetLower.includes('discord')) score += 0.1;
        break;
      case 'Reddit':
        if (titleLower.includes('subreddit') || snippetLower.includes('subreddit')) score += 0.1;
        if (title.startsWith('r/')) score += 0.1;
        break;
      case 'Facebook':
        if (titleLower.includes('group') || snippetLower.includes('group')) score += 0.1;
        break;
      case 'LinkedIn':
        if (titleLower.includes('professional') || snippetLower.includes('professional')) score += 0.1;
        if (titleLower.includes('group') || snippetLower.includes('group')) score += 0.1;
        break;
      case 'Telegram':
        if (titleLower.includes('channel') || snippetLower.includes('channel')) score += 0.1;
        if (titleLower.includes('telegram') || snippetLower.includes('telegram')) score += 0.1;
        break;
    }
    
    // Penalty for generic or spammy content
    const spamIndicators = ['buy', 'sell', 'cheap', 'free download', 'click here', 'advertisement'];
    const spamCount = spamIndicators.filter(spam => 
      titleLower.includes(spam) || snippetLower.includes(spam)
    ).length;
    
    score -= spamCount * 0.2;
    
    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if URL is from the expected platform
   * @param url - The URL to check
   * @param platform - Expected platform name
   * @returns boolean - Whether URL matches the platform
   */
  private isValidPlatformUrl(url: string, platform: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      switch (platform) {
        case 'Discord':
          return hostname.includes('discord.gg') || 
                 hostname.includes('discord.com') ||
                 hostname.includes('discordapp.com');
        case 'Reddit':
          return hostname.includes('reddit.com') && (url.includes('/r/') || url.includes('/subreddit/'));
        case 'Facebook':
          return hostname.includes('facebook.com') && url.includes('/groups/');
        case 'LinkedIn':
          return hostname.includes('linkedin.com') && url.includes('/groups/');
        case 'Telegram':
          return hostname.includes('t.me') || 
                 hostname.includes('telegram.me') || 
                 hostname.includes('telegram.org');
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Clean and format the community title
   * @param title - Raw title from search results
   * @param platform - Platform name for context
   * @returns string - Cleaned title
   */
  private cleanTitle(title: string, platform: string): string {
    // Remove platform-specific suffixes and clean up the title
    let cleanedTitle = title
      .replace(/\s*-\s*(Discord|Reddit|Facebook|LinkedIn|Telegram).*$/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .replace(/\s*:\s*.*$/, '')
      .replace(/^r\//, '') // Remove Reddit prefix
      .replace(/\s*\(\d+\)$/, '') // Remove member counts
      .trim();

    // If title is too short or generic, keep original
    if (cleanedTitle.length < 3) {
      cleanedTitle = title.trim();
    }

    return cleanedTitle;
  }

  /**
   * Format results for display as requested
   * @param keyword - The search keyword
   * @param communities - Array of community results
   * @returns string - Formatted output string
   */
  formatResults(keyword: string, communities: CommunityResult[]): string {
    if (!communities || communities.length === 0) {
      return '';
    }
    
    let output = `/community\n`;
    
    // Sort by relevance score and limit to top results
    const topCommunities = communities
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Limit to top 5 most relevant results
    
    for (const community of topCommunities) {
      output += `${community.title}:${community.platform}:${community.url}\n`;
    }
    
    return output.trim();
  }
}

// Main function to search and format results
export async function searchCommunitiesForKeyword(keyword: string): Promise<string> {
  const searcher = new GoogleCommunitySearcher();
  const communities = await searcher.searchCommunities(keyword);
  
  if (!communities) {
    return ''; // Don't return anything if no results found
  }
  
  return searcher.formatResults(keyword, communities);
}

// Example usage function
export async function searchMultipleKeywords(keywords: string[]): Promise<string[]> {
  const results: string[] = [];
  
  for (const keyword of keywords) {
    const result = await searchCommunitiesForKeyword(keyword);
    if (result) { // Only add if results were found
      results.push(result);
    }
    
    // Add delay between keyword searches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}