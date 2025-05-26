import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import Groq from 'groq-sdk';
import { searchJobsFormatted } from '../api/getjobsforchat';
import { generateResume } from '../api/createresume';
import { searchCoursesForKeyword } from '../api/getCourses';

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
    const systemPrompt = `You are Asha, a supportive female assistant focused on jobs, careers, and mental health for women. Stay strictly on these topics and maintain professional boundaries.

${chatId ? `CONVERSATION CONTEXT:
Previous conversation summary: ${updatedContext}

Continue this conversation naturally, referring to previous topics when relevant.` : 'This is the start of a new conversation.'}

Core Behavior:
- Use '\n' properly for newlines keep it seperated from text
- Respond warmly and conversationally in the same language as the user
- IF you are creating JSON Output don't generate any extra text follow the template strictly
- Stay focused on career guidance, job searching, resume building, community finding, course recommendations, job portals, and mental health support
- Do not entertain inappropriate behavior or off-topic requests
- Do not filter out emojis from responses
- Reference previous conversation when relevant and helpful

Response Protocol:
1. Course Search Requests
If user asks about courses, learning, education, training, skill development, or certification in current message, respond ONLY with:
"/course:keyword"

Where keyword is the main subject they want to learn (e.g., python, javascript, marketing, data science, etc.)
Extract the most relevant keyword from their request.

2. Job Portal Requests
If user asks about job portals, job websites, job boards, where to find jobs, or job platforms in current message, respond ONLY with:
"/jobportals"

3. Community Search Requests
If user asks about finding communities, groups, support networks, or mentions wanting to connect with others in current message, respond ONLY with:
"/community
name1:platform:link1
name2:platform:link2
name3:platform:link3
name4:platform:link4
name5:platform:link5"

Provide 5 relevant communities with:
- name: Community/group name
- platform: Platform name (Discord, Reddit, Facebook, LinkedIn, Telegram, etc.)
- link: Direct URL or invitation link

4. Resume/CV Requests
If user asks about resume generation in current message, CV creation, or resume building, respond ONLY with:
"GENERATEPDF"

5. Job Search Requests
If user is searching jobs, employment opportunities, or mentions a job title they want in current message or asking for job suggestions respond ONLY with:
"JOB_SEARCH: [job_title] [location]"
Use "India" if no location specified.

6. All Other Messages
Provide detailed JSON output only nothing else no extra text. 
Answer it Considering Previous Message Context and conversation flow.
IF its a casual message give a casual response in plain text. If its casual give natural short response and use emojis if required.
For Informative message make it pointwise in very long detail and use markdown and give proper links.

For both Informative and general chat follow this below structure strictly and no extra text:

IMPORTANT: When creating JSON, ensure all string values are properly escaped:
- Replace all newlines with \\n
- Replace all quotes with \\"  
- Replace all backslashes with \\\\
- Keep markdown formatting but escape it properly
- DO NOT filter out emojis - preserve all emojis in responses

{
  "response": "Natural, supportive response in user's language with emojis preserved or For informative query reply in markdown very long in very detail and pointwise. Reference previous conversation when relevant.",
  "context": "Comprehensive conversation context including this exchange for future reference", 
  "chatName": "Suggested conversation title based on the overall conversation",
  "emoji": "Single relevant aesthetic emoji"
}

Response Guidelines:
- Use proper grammar and local expressions when appropriate
- Be genuinely engaging and emotionally supportive
- Keep responses focused on career development, mental wellness, community building, courses, and job searching
- Redirect off-topic conversations back to core subjects
- Maintain professional boundaries while being warm and approachable
- Preserve all emojis in responses and conversations
- Build upon previous conversation points when relevant`;

    // Make single Groq request
    const response = await groqClient.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.9,
      max_tokens: 5000
    });

    const groqResponse = response.choices[0]?.message?.content || '';

    // Check if this is a course search request with new format
    if (groqResponse.startsWith('/course:')) {
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
    // Check if this is a community search request
    else if (groqResponse.startsWith('/community')) {
      botResponse = groqResponse;
      
      // Use community-related emoji and chat name for new chats
      if (!chatId) {
        updatedEmoji = emoji || '👥';
        updatedChatName = chatName || 'Community Search';
        updatedContext = 'User requested community search. Provided community recommendations.';
      } else {
        // Update context for existing chats
        updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Provided community search results.`;
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
    // Check if this is a job search request
    else if (groqResponse.startsWith('JOB_SEARCH:')) {
      const jobSearchPart = groqResponse.replace('JOB_SEARCH:', '').trim();
      const parts = jobSearchPart.split(' ');
      
      if (parts.length >= 2) {
        // Extract job title (all parts except the last one) and location (last part)
        const location = parts[parts.length - 1];
        const jobTitle = parts.slice(0, -1).join(' ');
        
        try {
          // Call the job search API which will return formatted response
          botResponse = await searchJobsFormatted(
            jobTitle, 
            location === 'anywhere' ? undefined : location
          );
          
          // Use job-related emoji and chat name for new chats
          if (!chatId) {
            updatedEmoji = emoji || '💼';
            updatedChatName = chatName || `Job Search: ${jobTitle}${location !== 'anywhere' ? ` in ${location}` : ''}`;
            updatedContext = `User is searching for ${jobTitle} jobs${location !== 'anywhere' ? ` in ${location}` : ''}. Providing job search results.`;
          } else {
            // Update context for existing chats
            updatedContext = `${updatedContext}\n\nUser: ${message}\nAssistant: Searched for ${jobTitle} jobs${location !== 'anywhere' ? ` in ${location}` : ''} and provided results.`;
          }
        } catch (error) {
          console.error('Job search error:', error);
          botResponse = "I encountered an error while searching for jobs. Please try again with a different search term.";
        }
      } else {
        botResponse = "I couldn't understand your job search request. Please specify the job title you're looking for.";
      }
    } else {
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