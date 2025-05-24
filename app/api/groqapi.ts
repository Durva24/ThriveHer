import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import Groq from 'groq-sdk';
import { searchJobsFormatted } from '../api/getjobsforchat';
import { generateResume } from '../api/createresume';
import { findRedditCommunities } from './api/getcommunities';

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

// Helper function to format Reddit communities for display
const formatRedditCommunities = (communities: any) => {
  if (!communities || !communities.communities || communities.communities.length === 0) {
    return "I couldn't find any relevant communities for your search. Please try with different keywords.";
  }

  let response = `Found ${communities.communities.length} relevant Reddit communities:\n\n`;
  
  communities.communities.forEach((community: any) => {
    response += `**${community.displayName}**\n`;
    response += `• Members: ${community.subscribers.toLocaleString()}\n`;
    response += `• Link: ${community.fullUrl}\n`;
    if (community.description) {
      response += `• Description: ${community.description.substring(0, 100)}${community.description.length > 100 ? '...' : ''}\n`;
    }
    response += '\n';
  });

  response += "\nClick on any link to join the community and start engaging with like-minded people!";
  return response;
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
    
    // For existing chats, fetch full information
    if (chatId) {
      // Fetch existing context if not provided but chatId exists
      if (!context) {
        const { data: contextData, error: contextError } = await supabase
          .from('chat_contexts')
          .select('context')
          .eq('chat_id', chatId)
          .single();
          
        if (!contextError && contextData) {
          updatedContext = contextData.context;
        } else {
          updatedContext = '';
        }
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
      
      // Fetch recent message history to enhance context
      const { data: recentMessages, error: messagesError } = await supabase
        .from('messages')
        .select('is_user_message, content')
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: false })
        .limit(10);
        
      if (!messagesError && recentMessages) {
        // Create a context summary from recent messages if we have a limited context
        if (!updatedContext || updatedContext.length < 1000) {
          const recentExchanges = recentMessages
            .reverse()
            .map(msg => `${msg.is_user_message ? 'User' : 'Assistant'}: ${msg.content}`)
            .join('\n');
            
          // Append recent exchanges to existing context or create new context
          updatedContext = updatedContext 
            ? `${updatedContext}\n \n Recent conversation:\n ${recentExchanges}` 
            : `Conversation history:\n ${recentExchanges}`;
        }
      }
    } else {
      // Create a new chat if chatId is not provided
      // Generate a default chat name based on first message
      const defaultChatName = message.length > 30 
        ? `${message.substring(0, 30)}...` 
        : message;
      
      updatedChatName = chatName || defaultChatName;
      updatedEmoji = emoji || '💬'; // Default emoji
      updatedContext = context || '';
    }
    
    // Construct the enhanced system prompt with community detection
    const systemPrompt = `You are Asha, a supportive female assistant focused on jobs, careers, mental health for women, and community building. Stay strictly on these topics and maintain professional boundaries.

Core Behavior:
- Respond warmly and conversationally in the same language as the user
- IF you are creating JSON Output don't generate any extra text follow the template strictly
- Stay focused on career guidance, job searching, resume building, mental health support, and community connections
- Do not entertain inappropriate behavior or off-topic requests

Response Protocol:

1. Resume/CV Requests
If user asks about resume generation in current message, CV creation, or resume building, respond ONLY with:
"GENERATEPDF"

2. Job Search Requests
If user asks about specific jobs, employment opportunities, or mentions a job title they want in current message, respond ONLY with:
"JOB_SEARCH: [job_title] [location]"
Use "India" if no location specified.

3. Community/Group/Forum Requests
If user asks about finding communities, groups, forums, support networks, or mentions wanting to connect with like-minded people on specific topics, respond ONLY with:
"COMMUNITY: [search_terms]"
Example: If user says "I want to find communities about web development" respond with "COMMUNITY: web development"

4. All Other Messages
Provide detailed JSON output only nothing else no extra text. 
IF its a casual message give response in plain text. 
For Informative message make it pointwise in very long detail and use markdown and give proper links.
For both Informative and general chat follow this below structure strictly and no extra text:

IMPORTANT: When creating JSON, ensure all string values are properly escaped:
- Replace all newlines with '\\n '
- Replace all quotes with \\"  
- Replace all backslashes with \\\\
- Keep markdown formatting but escape it properly

{
  "response": "Natural, supportive response in user's language with minimal emojis or For informative query reply in markdown very long in very detail and pointwise ",
  "context": "Comprehensive conversation context for future reference", 
  "chatName": "Suggested conversation title",
  "emoji": "Single relevant aesthetic emoji"
}

Response Guidelines:
- Use proper grammar and local expressions when appropriate
- Be genuinely engaging and emotionally supportive
- Keep responses focused on career development, mental wellness, and community building
- Redirect off-topic conversations back to core subjects
- Maintain professional boundaries while being warm and approachable`;

    // Make single Groq request
    const response = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 5000
    });

    const groqResponse = response.choices[0]?.message?.content || '';

    // Check if this is a resume generation request
    if (groqResponse.trim() === 'GENERATEPDF') {
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
          updatedContext = `${updatedContext}\n\nUser requested resume generation. Generated resume successfully.`;
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
            updatedContext = `${updatedContext}\n\nUser searched for ${jobTitle} jobs${location !== 'anywhere' ? ` in ${location}` : ''}. Provided job search results.`;
          }
        } catch (error) {
          console.error('Job search error:', error);
          botResponse = "I encountered an error while searching for jobs. Please try again with a different search term.";
        }
      } else {
        botResponse = "I couldn't understand your job search request. Please specify the job title you're looking for.";
      }
    }
    // Check if this is a community search request
    else if (groqResponse.startsWith('COMMUNITY:')) {
      const communitySearchTerms = groqResponse.replace('COMMUNITY:', '').trim();
      
      try {
        // Call the Reddit communities API
        const communities = await findRedditCommunities(communitySearchTerms, 10);
        
        // Format the communities response
        botResponse = formatRedditCommunities(communities);
        
        // Use community-related emoji and chat name for new chats
        if (!chatId) {
          updatedEmoji = emoji || '👥';
          updatedChatName = chatName || `Communities: ${communitySearchTerms}`;
          updatedContext = `User searched for communities related to "${communitySearchTerms}". Provided Reddit community recommendations.`;
        } else {
          // Update context for existing chats
          updatedContext = `${updatedContext}\n\nUser searched for communities related to "${communitySearchTerms}". Provided Reddit community recommendations.`;
        }
      } catch (error) {
        console.error('Community search error:', error);
        botResponse = "I encountered an error while searching for communities. Please try again with different search terms.";
      }
    } 
    else {
      // Handle normal conversation - parse JSON response with safe parsing
      const parsedResponse = safeJsonParse(groqResponse);
      
      if (parsedResponse && parsedResponse.response) {
        botResponse = parsedResponse.response;
        updatedContext = parsedResponse.context || updatedContext;
        updatedChatName = parsedResponse.chatName || updatedChatName;
        updatedEmoji = parsedResponse.emoji || updatedEmoji;
      } else {
        console.warn("Failed to parse GROQ response, using fallback");
        // Fallback if JSON parsing completely fails
        botResponse = groqResponse || "I'm here to help! How can I assist you today?";
      }
    }
    
    // Handle database operations based on whether this is a new or existing chat
    if (!chatId) {
      // Create new chat with all information
      const { data: newChatId, error: createError } = await supabase.rpc(
        'create_chat_with_messages',
        {
          user_id: userId,
          title: updatedChatName,
          user_message: message,
          bot_response: botResponse,
          context: updatedContext,
          p_emoji: updatedEmoji
        }
      );
      
      if (createError) throw new Error(`Failed to create chat: ${createError.message}`);
      generatedChatId = newChatId || generatedChatId;
    } else {
      // Add message pair for existing chat
      await supabase.rpc('add_message_pair', {
        chat_id: chatId,
        user_message: message,
        bot_response: botResponse
      });
      
      // Update context with enhanced information
      await supabase
        .from('chat_contexts')
        .upsert({
          chat_id: chatId,
          context: updatedContext,
          timestamp: timestamp
        });
      
      // Update chat details if they've changed
      await supabase
        .from('chats')
        .update({ 
          title: updatedChatName,
          emoji: updatedEmoji,
          updated_at: timestamp
        })
        .eq('id', chatId);

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
    
    // If we have a chatId, still try to save the error message
    if (request.chatId) {
      try {
        await supabase.rpc('add_message_pair', {
          chat_id: request.chatId,
          user_message: request.message,
          bot_response: "Sorry, I encountered an error while processing your message. Please try again."
        });
      } catch (dbError) {
        console.error('Failed to save error message:', dbError);
      }
    }
    
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