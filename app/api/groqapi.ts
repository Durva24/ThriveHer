import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import Groq from 'groq-sdk';
import { searchJobsFormatted } from '../api/getjobsforchat';
import { generateResume } from '../api/createresume';
import { searchCoursesForKeyword } from '../api/getCourses';
import { searchCommunitiesForKeyword } from '../api/getCommunities';  

interface GroqRequest {
  message: string;
  chatId?: string;
  userId: string;
  chatName?: string;
  context?: string;
  emoji?: string;
}

interface GroqResponse {
  botResponse: string;
  updatedContext: string;
  chatId: string;
  chatName: string;
  emoji: string;
  timestamp: string;
}

// Initialize Supabase client with hardcoded URL and key
const supabaseUrl = 'https://ibwjjwzomoyhkxugmmmw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlid2pqd3pvbW95aGt4dWdtbW13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4NzkwODgsImV4cCI6MjA2MDQ1NTA4OH0.RmnNBQh_1KJo0TgCjs72aBoxWoOsd_vWjNeIHRfVXac';
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Groq API key
const groqApiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY || Constants.expoConfig?.extra?.groqApiKey || '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';

// Initialize Groq client
const groqClient = new Groq({ 
  apiKey: groqApiKey,
  dangerouslyAllowBrowser: true
});

// Helper function to safely parse JSON with fallback
const safeJsonParse = (jsonString: string) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Primary JSON parse failed, attempting to clean and retry:', error);
    
    try {
      // Attempt to clean common JSON formatting issues
      let cleanedJson = jsonString
        .replace(/[\r\n\t]/g, ' ') // Replace newlines and tabs with spaces
        .replace(/\\/g, '\\\\') // Escape backslashes
        .replace(/"/g, '\\"') // Escape quotes
        .replace(/\\\\"response\\\\":/g, '"response":') // Fix response key
        .replace(/\\\\"context\\\\":/g, '"context":') // Fix context key  
        .replace(/\\\\"chatName\\\\":/g, '"chatName":') // Fix chatName key
        .replace(/\\\\"emoji\\\\":/g, '"emoji":') // Fix emoji key
        .replace(/\\\\"([^"]+)\\\\":/g, '"$1":'); // Fix other keys
      
      return JSON.parse(cleanedJson);
    } catch (secondError) {
      console.warn('Secondary JSON parse also failed:', secondError);
      
      // Try to extract values using regex as last resort
      try {
        const responseMatch = jsonString.match(/"response":\s*"([^"]*(?:\\"[^"]*)*)"/) || 
                             jsonString.match(/response['":\s]+([^,}]+)/);
        const contextMatch = jsonString.match(/"context":\s*"([^"]*(?:\\"[^"]*)*)"/) ||
                            jsonString.match(/context['":\s]+([^,}]+)/);
        const chatNameMatch = jsonString.match(/"chatName":\s*"([^"]*(?:\\"[^"]*)*)"/) ||
                             jsonString.match(/chatName['":\s]+([^,}]+)/);
        const emojiMatch = jsonString.match(/"emoji":\s*"([^"]*)"/) ||
                          jsonString.match(/emoji['":\s]+([^,}]+)/);
        
        return {
          response: responseMatch ? responseMatch[1].replace(/\\"/g, '"') : null,
          context: contextMatch ? contextMatch[1].replace(/\\"/g, '"') : null,
          chatName: chatNameMatch ? chatNameMatch[1].replace(/\\"/g, '"') : null,
          emoji: emojiMatch ? emojiMatch[1] : null
        };
      } catch (regexError) {
        console.warn('Regex extraction also failed:', regexError);
        return null;
      }
    }
  }
};

// Helper function to create a new chat
const createNewChat = async (userId: string, title: string, emoji: string) => {
  const chatId = uuidv4();
  const timestamp = new Date().toISOString();
  
  const { error } = await supabase
    .from('chats')
    .insert({
      id: chatId,
      user_id: userId,
      title: title,
      emoji: emoji,
      created_at: timestamp,
      updated_at: timestamp
    });
  
  if (error) {
    console.error('Error creating chat:', error);
    throw new Error(`Failed to create chat: ${error.message}`);
  }
  
  return chatId;
};

// Helper function to update or insert context using upsert
const updateChatContext = async (chatId: string, context: string, timestamp: string) => {
  // Use upsert to handle both insert and update cases
  // Since chat_id has a unique constraint, this will update if exists, insert if not
  const { error } = await supabase
    .from('chat_contexts')
    .upsert({
      chat_id: chatId,
      context: context,
      timestamp: timestamp
    }, {
      onConflict: 'chat_id' // Specify the conflict column
    });
  
  if (error) {
    console.error('Error upserting context:', error);
    throw new Error(`Failed to upsert context: ${error.message}`);
  }
};

// Helper function to get conversation context
const getConversationContext = async (chatId: string) => {
  try {
    // Get stored context
    const { data: contextData, error: contextError } = await supabase
      .from('chat_contexts')
      .select('context')
      .eq('chat_id', chatId)
      .single();

    let storedContext = '';
    if (!contextError && contextData) {
      storedContext = contextData.context;
    }

    return {
      storedContext
    };
  } catch (error) {
    console.error('Error getting conversation context:', error);
    return {
      storedContext: ''
    };
  }
};

export const processWithGroq = async (request: GroqRequest): Promise<GroqResponse> => {
  try {
    const { message, userId } = request;
    let { chatId, chatName, context, emoji } = request;
    const timestamp = new Date().toISOString();
    let generatedChatId = chatId || uuidv4();
    
    // Initialize with default values
    let updatedContext = context || "";
    let updatedChatName = chatName || "Conversation";
    let updatedEmoji = emoji || "💬";
    let botResponse = "";
    
    // Get conversation context for existing chats
    let storedContext = '';
    
    if (chatId) {
      const contextData = await getConversationContext(chatId);
      storedContext = contextData.storedContext;
      
      // Use stored context if no context provided
      if (!context) {
        updatedContext = storedContext;
      }
      
      // Fetch chat details if not provided
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('title, emoji')
        .eq('id', chatId)
        .single();
        
      if (!chatError && chatData) {
        updatedChatName = chatName || chatData.title;
        updatedEmoji = emoji || chatData.emoji;
      } else {
        updatedChatName = chatName || 'Ongoing Conversation';
        updatedEmoji = emoji || '💬';
      }
    } else {
      // Generate a default chat name based on first message
      const defaultChatName = message.length > 30 
        ? `${message.substring(0, 30)}...` 
        : message;
      
      updatedChatName = chatName || defaultChatName;
      updatedEmoji = emoji || '💬'; // Default emoji
      updatedContext = context || '';
    }
    
    // Construct the enhanced system prompt with context
    const systemPrompt = `You are Asha, a supportive female assistant focused on jobs, careers, and mental health for women. You must analyze user messages carefully and respond according to specific patterns.

${chatId ? `PREVIOUS CONVERSATION CONTEXT:
${updatedContext}
Continue this conversation naturally, referring to previous topics when relevant.` : 'This is the start of a new conversation.'}

CRITICAL: You must analyze the user's message and detect their intent FIRST. Then respond with the EXACT format specified below.

INTENT DETECTION RULES:
Dont Generate Extra text and Predict the intent properly
Analyze the user message for these keywords and phrases:

1. JOB SEARCH INTENT - If user mentions:
   - Looking for jobs, job search, find jobs, employment opportunities
   - Specific job titles like "software engineer jobs", "marketing jobs"
   - "hire me", "job openings", "job vacancies"
   - "apply for jobs", "job applications"
   Response: "JOB_SEARCH: [job_title] [location]" (use "India" if no location mentioned)

2. COURSE SEARCH INTENT - If user mentions:
   - Want to learn, courses, training, education, skills
   - If user is asking to search any courses
   - "learn programming", "python course", "marketing training"
   - Certification, online classes, tutorials, study
   - "upskill", "reskill", "course recommendations"
   Response: "/course:keyword" (extract main subject they want to learn)

3. COMMUNITY SEARCH INTENT - If user mentions:
   - Find communities, groups, discord, reddit, telegram
   - "connect with people", "networking", "join groups"
   - "community for developers", "groups for women"
   - Social networks, forums, meetups
   Response: "/community:keyword" (extract main topic/interest)

4. JOB PORTALS INTENT - If user mentions:
   - Job websites, job boards, job portals, job sites
   - "where to find jobs", "job platforms", "recruitment sites"
   - Naukri, LinkedIn Jobs, Indeed, job apps
   Response: "/jobportals"

5. RESUME INTENT - If user mentions:
   - Resume, CV, curriculum vitae, resume building
   - "create resume", "resume help", "build CV"
   - Portfolio creation, resume templates
   Response: "GENERATEPDF"

6. CASUAL/INFORMATIVE CONVERSATION - If NONE of the above intents match:
   Determine if message is:
   - CASUAL: Greetings, small talk, personal questions, emotions
   - INFORMATIVE: Career advice, technical questions, detailed explanations

For CASUAL messages: Respond naturally like a human friend, keep it conversational and short. Use emojis.
For INFORMATIVE messages: Provide detailed, well-structured information with markdown formatting, bullet points, and comprehensive explanations.

For both CASUAL and INFORMATIVE, use this JSON format:
{
  "response": "Your response here (casual and short OR detailed with markdown)",
  "context": "Summary of conversation including this exchange",
  "chatName": "Suitable conversation title",
  "emoji": "Single relevant emoji"
}

IMPORTANT JSON FORMATTING RULES:
- Escape all newlines as \\n
- Escape all quotes as \\"
- Keep all emojis intact
- Don't add any extra text outside the JSON or specified response formats

RESPONSE GUIDELINES:
- Stay focused on careers, jobs, mental health, and women's professional development
- Be warm, supportive, and encouraging
- Reference previous conversation when relevant
- Maintain professional boundaries
- Use the user's language naturally`;

    // Make single Groq request
    const response = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.5,
      max_tokens: 5000
    });

    const groqResponse = response.choices[0]?.message?.content || '';

    // Check if this is a job search request - EXECUTE API CALL DIRECTLY
    if (groqResponse.startsWith('JOB_SEARCH:')) {
      const jobSearchPart = groqResponse.replace('JOB_SEARCH:', '').trim();
      
      // Parse the job search parameters more robustly
      let jobTitle = '';
      let location = 'India'; // Default location
      
      // Handle different formats: "JOB_SEARCH: developer" or "JOB_SEARCH: developer bangalore"
      if (jobSearchPart.includes(' in ')) {
        const parts = jobSearchPart.split(' in ');
        jobTitle = parts[0].trim();
        location = parts[1].trim();
      } else {
        const parts = jobSearchPart.split(' ');
        if (parts.length > 1) {
          // Last word might be location, check if it's a common location
          const lastWord = parts[parts.length - 1].toLowerCase();
          const commonLocations = ['india', 'bangalore', 'mumbai', 'delhi', 'pune', 'hyderabad', 'chennai', 'kolkata', 'gurgaon', 'noida', 'anywhere'];
          
          if (commonLocations.includes(lastWord)) {
            location = parts[parts.length - 1];
            jobTitle = parts.slice(0, -1).join(' ');
          } else {
            jobTitle = jobSearchPart;
          }
        } else {
          jobTitle = jobSearchPart;
        }
      }
      
      if (jobTitle.trim()) {
        try {
          console.log(`Searching for jobs: "${jobTitle}" in "${location}"`);
          
          // Call the job search API with proper error handling
          const jobSearchResults = await searchJobsFormatted(
            jobTitle.trim(), 
            location.toLowerCase() === 'anywhere' ? undefined : location.trim(),
            1, // page
            1, // numPages  
            'in', // country code for India
            'all' // datePosted
          );
          
          if (jobSearchResults && jobSearchResults.length > 0) {
            botResponse = jobSearchResults;
          } else {
            botResponse = `I couldn't find any jobs for "${jobTitle}"${location !== 'India' ? ` in ${location}` : ''}. Try searching with different keywords or check back later for new opportunities.`;
          }
          
          // Use job-related emoji and chat name for new chats
          if (!chatId) {
            updatedEmoji = emoji || '💼';
            updatedChatName = chatName || `${jobTitle} Jobs${location !== 'India' ? ` in ${location}` : ''}`;
            updatedContext = `User is searching for ${jobTitle} jobs${location !== 'India' ? ` in ${location}` : ''}. Providing job search results.`;
          } else {
            // Update context for existing chats
            updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Searched for ${jobTitle} jobs${location !== 'India' ? ` in ${location}` : ''} and provided results.`;
          }
          
        } catch (error) {
          console.error('Job search API error:', error);
          
          // Provide more specific error messages based on error type
          let errorMessage = "I encountered an error while searching for jobs. ";
          
          if (error.status === 401) {
            errorMessage += "There seems to be an authentication issue with the job search service.";
          } else if (error.status === 429) {
            errorMessage += "Too many requests. Please wait a moment and try again.";
          } else if (error.status >= 500) {
            errorMessage += "The job search service is temporarily unavailable.";
          } else {
            errorMessage += "Please try again with different search terms.";
          }
          
          botResponse = errorMessage;
          
          // Still update context even on error
          if (!chatId) {
            updatedEmoji = emoji || '⚠️';
            updatedChatName = chatName || 'Job Search Error';
            updatedContext = `User attempted to search for ${jobTitle} jobs. Error occurred during search.`;
          } else {
            updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Error occurred while searching for ${jobTitle} jobs.`;
          }
        }
      } else {
        botResponse = "I couldn't understand your job search request. Please specify the job title you're looking for. For example: 'Find software engineer jobs' or 'Search for marketing jobs in Mumbai'.";
        
        // Update context for unclear request
        if (!chatId) {
          updatedEmoji = emoji || '❓';
          updatedChatName = chatName || 'Job Search Help';
          updatedContext = 'User made unclear job search request. Provided guidance.';
        } else {
          updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Requested clarification for job search.`;
        }
      }
    }
    // Check if this is a course search request with new format
    else if (groqResponse.startsWith('/course:')) {
      const keyword = groqResponse.replace('/course:', '').trim();
      
      try {
        // Call the Google search API to get actual course results
        const courseResults = await searchCoursesForKeyword(keyword);
        
        if (courseResults) {
          botResponse = courseResults;
        } else {
          botResponse = `Sorry, I couldn't find any courses for "${keyword}". Please try a different search term or check back later.`;
        }
        
        // Use course-related emoji and chat name for new chats
        if (!chatId) {
          updatedEmoji = emoji || '📚';
          updatedChatName = chatName || `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Courses`;
          updatedContext = `User requested courses for "${keyword}". Provided course recommendations.`;
        } else {
          // Update context for existing chats
          updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Provided course search results for "${keyword}".`;
        }
      } catch (error) {
        console.error('Course search error:', error);
        botResponse = `I encountered an error while searching for "${keyword}" courses. Please try again.`;
      }
    }
    // Check if this is a job portal request
    else if (groqResponse.trim() === '/jobportals') {
      botResponse = '/jobportals';
      
      // Use job portal-related emoji and chat name for new chats
      if (!chatId) {
        updatedEmoji = emoji || '🌐';
        updatedChatName = chatName || 'Job Portals';
        updatedContext = 'User requested job portals information.';
      } else {
        // Update context for existing chats
        updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Provided job portals information.`;
      }
    }
    // Check if this is a community search request with new format
    else if (groqResponse.startsWith('/community:')) {
      const keyword = groqResponse.replace('/community:', '').trim();
      
      try {
        // Call the community search API to get actual community results
        const communityResults = await searchCommunitiesForKeyword(keyword);
        
        if (communityResults) {
          botResponse = communityResults;
        } else {
          botResponse = `Sorry, I couldn't find any communities for "${keyword}". Please try a different search term or check back later.`;
        }
        
        // Use community-related emoji and chat name for new chats
        if (!chatId) {
          updatedEmoji = emoji || '👥';
          updatedChatName = chatName || `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Communities`;
          updatedContext = `User requested communities for "${keyword}". Provided community recommendations.`;
        } else {
          // Update context for existing chats
          updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Provided community search results for "${keyword}".`;
        }
      } catch (error) {
        console.error('Community search error:', error);
        botResponse = `I encountered an error while searching for "${keyword}" communities. Please try again.`;
      }
    }
    // Check if this is a resume generation request
    else if (groqResponse.trim() === 'GENERATEPDF') {
      try {
        // Call the resume generation API
        const resumeResult = await generateResume();
        
        // Return the result as is from the resume generator
        botResponse = resumeResult;
        
        // Use resume-related emoji and chat name for new chats
        if (!chatId) {
          updatedEmoji = emoji || '📄';
          updatedChatName = chatName || 'Resume Generation';
          updatedContext = 'User requested resume generation. Generated resume successfully.';
        } else {
          // Update context for existing chats
          updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Generated resume for user.`;
        }
      } catch (error) {
        console.error('Resume generation error:', error);
        botResponse = "I encountered an error while generating your resume. Please try again.";
      }
    }
    else {
      // Handle normal conversation - parse JSON response with safe parsing
      const parsedResponse = safeJsonParse(groqResponse);
      
      if (parsedResponse && parsedResponse.response) {
        botResponse = parsedResponse.response;
        // Update context with the conversation flow
        if (parsedResponse.context) {
          updatedContext = parsedResponse.context;
        } else {
          // Build context from the current exchange
          updatedContext = chatId 
            ? `${updatedContext}\n\nUser: ${message}\nAssistant: ${botResponse.substring(0, 200)}${botResponse.length > 200 ? '...' : ''}`
            : `User: ${message}\nAssistant: ${botResponse.substring(0, 200)}${botResponse.length > 200 ? '...' : ''}`;
        }
        updatedChatName = parsedResponse.chatName || updatedChatName;
        updatedEmoji = parsedResponse.emoji || updatedEmoji;
      } else {
        console.warn("Failed to parse GROQ response, using fallback");
        // Fallback if JSON parsing completely fails
        botResponse = groqResponse || "I'm here to help! How can I assist you today?";
        // Still update context for continuity
        updatedContext = chatId 
          ? `${updatedContext}\n\nUser: ${message}\nAssistant: ${botResponse.substring(0, 200)}${botResponse.length > 200 ? '...' : ''}`
          : `User: ${message}\nAssistant: ${botResponse.substring(0, 200)}${botResponse.length > 200 ? '...' : ''}`;
      }
    }
    
    // Handle database operations - only update metadata, NO MESSAGE SAVING
    if (!chatId) {
      // Create new chat only
      generatedChatId = await createNewChat(userId, updatedChatName, updatedEmoji);
      
      // Add context for new chat
      await updateChatContext(generatedChatId, updatedContext, timestamp);
      
    } else {
      // Update context for existing chat
      await updateChatContext(chatId, updatedContext, timestamp);
      
      // Update chat details if they've changed
      const { error: updateError } = await supabase
        .from('chats')
        .update({ 
          title: updatedChatName,
          emoji: updatedEmoji,
          updated_at: timestamp
        })
        .eq('id', chatId);
      
      if (updateError) {
        console.error('Error updating chat:', updateError);
      }
      
      generatedChatId = chatId;
    }
    
    // Return the complete formatted response
    return {
      botResponse,
      updatedContext,
      chatId: generatedChatId,
      chatName: updatedChatName,
      emoji: updatedEmoji,
      timestamp
    };
    
  } catch (error) {
    console.error('Error in processWithGroq:', error);
    // Provide default values for error case
    const errorEmoji = '⚠️';
    const errorChatId = request.chatId || uuidv4();
    
    return {
      botResponse: "Sorry, I encountered an error while processing your message. Please try again.",
      updatedContext: request.context || "", 
      chatId: errorChatId,
      chatName: request.chatName || "Error Conversation",
      emoji: request.emoji || errorEmoji,
      timestamp: new Date().toISOString()
    };
  }
};

// Helper functions remain unchanged
export const getChatHistory = async (chatId: string) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: true });
    
  if (error) throw new Error(`Failed to get chat history: ${error.message}`);
  return data;
};

export const getChatDetails = async (chatId: string) => {
  const { data, error } = await supabase
    .from('chats')
    .select('title, emoji, created_at, updated_at')
    .eq('id', chatId)
    .single();
    
  if (error) throw new Error(`Failed to get chat details: ${error.message}`);
  return data;
};