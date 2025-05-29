// voiceTranscriptionAPI.ts - Optimized for Indian Languages + English

// Hardcoded API key (replace with your actual Groq API key)
const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  language?: string; // Detected language code
  languageName?: string; // Human-readable language name
  isIndianLanguage?: boolean; // Whether detected language is Indian
  confidence?: number; // Confidence score if available
  duration?: number; // Duration of audio in seconds
  error?: string;
}

export interface VoiceRecordingOptions {
  maxDuration?: number; // in milliseconds, default 30000 (30 seconds)
  autoStop?: boolean; // Auto-stop after maxDuration, default true
  preferredLanguage?: SupportedLanguageCode; // Hint for expected language
  onStatusChange?: (status: RecordingStatus) => void; // Callback for status updates
}

export type RecordingStatus = 'idle' | 'requesting-permission' | 'recording' | 'stopping' | 'processing' | 'completed' | 'error';

// Supported Indian languages plus English
export type SupportedLanguageCode = 
  | 'en'   // English
  | 'hi'   // Hindi
  | 'bn'   // Bengali
  | 'te'   // Telugu
  | 'mr'   // Marathi
  | 'ta'   // Tamil
  | 'gu'   // Gujarati
  | 'kn'   // Kannada
  | 'ml'   // Malayalam
  | 'or'   // Odia
  | 'pa'   // Punjabi
  | 'as'   // Assamese
  | 'ur'   // Urdu
  | 'ne'   // Nepali
  | 'sa';  // Sanskrit

// Global recorder management
let globalMediaRecorder: MediaRecorder | null = null;
let globalStream: MediaStream | null = null;
let recordingStatus: RecordingStatus = 'idle';
let statusCallback: ((status: RecordingStatus) => void) | null = null;

/**
 * Records audio from user's microphone and transcribes it using Groq's Whisper API
 * Optimized for Indian languages and English
 * @param options - Optional configuration for recording
 * @returns Promise<TranscriptionResult> - The transcribed text, detected language, or error
 */
export async function transcribeVoice(
  options: VoiceRecordingOptions = {}
): Promise<TranscriptionResult> {
  const {
    maxDuration = 30000, // 30 seconds default
    autoStop = true,
    preferredLanguage,
    onStatusChange
  } = options;

  statusCallback = onStatusChange || null;
  
  try {
    setRecordingStatus('requesting-permission');

    // Check browser compatibility
    if (!isAudioRecordingSupported()) {
      throw new Error('Audio recording not supported in this browser');
    }

    // Clean up any existing recording
    await stopRecording();

    // Request microphone access with settings optimized for multilingual speech
    globalStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000, // Optimal for speech recognition
        channelCount: 1, // Mono audio is sufficient for speech
      } 
    });

    // Use the best supported format for Indian language transcription
    const mimeType = getOptimalMimeType();
    globalMediaRecorder = new MediaRecorder(globalStream, { 
      mimeType,
      audioBitsPerSecond: 64000 // Good balance for multilingual speech
    });

    const audioChunks: Blob[] = [];

    // Set up event handlers
    globalMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    setRecordingStatus('recording');

    // Start recording
    globalMediaRecorder.start(100); // Collect data every 100ms

    // Set up auto-stop timer if enabled
    let autoStopTimeout: NodeJS.Timeout | null = null;
    if (autoStop) {
      autoStopTimeout = setTimeout(async () => {
        await stopRecording();
      }, maxDuration);
    }

    // Wait for recording to complete
    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      if (!globalMediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      globalMediaRecorder.onstop = () => {
        if (autoStopTimeout) {
          clearTimeout(autoStopTimeout);
        }
        
        if (audioChunks.length === 0) {
          reject(new Error('No audio data recorded'));
          return;
        }
        
        const blob = new Blob(audioChunks, { type: mimeType });
        resolve(blob);
      };

      globalMediaRecorder.onerror = (error) => {
        if (autoStopTimeout) {
          clearTimeout(autoStopTimeout);
        }
        reject(error);
      };
    });

    setRecordingStatus('processing');

    // Convert audio blob to transcription
    const transcription = await transcribeAudioBlob(audioBlob, preferredLanguage);
    
    setRecordingStatus('completed');
    return transcription;

  } catch (error) {
    setRecordingStatus('error');
    await cleanupRecording();

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Manually stop recording if it's in progress
 * @returns Promise<void>
 */
export async function stopRecording(): Promise<void> {
  if (globalMediaRecorder && globalMediaRecorder.state === 'recording') {
    setRecordingStatus('stopping');
    globalMediaRecorder.stop();
    
    // Wait a bit for the stop event to be processed
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await cleanupRecording();
}

/**
 * Get current recording status
 * @returns RecordingStatus
 */
export function getRecordingStatus(): RecordingStatus {
  return recordingStatus;
}

/**
 * Check if currently recording
 * @returns boolean
 */
export function isRecording(): boolean {
  return recordingStatus === 'recording';
}

/**
 * Clean up recording resources
 */
async function cleanupRecording(): Promise<void> {
  if (globalStream) {
    globalStream.getTracks().forEach(track => track.stop());
    globalStream = null;
  }
  
  globalMediaRecorder = null;
  
  if (recordingStatus !== 'completed' && recordingStatus !== 'error') {
    setRecordingStatus('idle');
  }
}

/**
 * Set recording status and notify callback
 */
function setRecordingStatus(status: RecordingStatus): void {
  recordingStatus = status;
  if (statusCallback) {
    statusCallback(status);
  }
}

/**
 * Get the optimal MIME type for Indian language transcription
 * @returns string - Best MIME type for Whisper with Indian languages
 */
function getOptimalMimeType(): string {
  // Whisper works best with these formats for multilingual content
  const preferredTypes = [
    'audio/wav',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];

  for (const type of preferredTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'audio/webm'; // Fallback
}

/**
 * Transcribe an audio blob using Groq's Whisper API
 * Optimized for Indian languages and English
 * @param audioBlob - The audio data to transcribe
 * @param preferredLanguage - Optional language hint
 * @returns Promise<TranscriptionResult> - The transcribed text, detected language, or error
 */
async function transcribeAudioBlob(
  audioBlob: Blob, 
  preferredLanguage?: SupportedLanguageCode
): Promise<TranscriptionResult> {
  try {
    // Prepare form data for the API request
    const formData = new FormData();
    
    formData.append('file', audioBlob, getFileName(audioBlob.type));
    
    // Use the latest Whisper model available on Groq
    formData.append('model', 'whisper-large-v3-turbo');
    
    // Enable verbose response to get language detection info
    formData.append('response_format', 'verbose_json');
    
    // Set temperature for consistent results with Indian languages
    formData.append('temperature', '0');
    
    // Add language hint if provided (helps with accuracy for Indian languages)
    if (preferredLanguage) {
      formData.append('language', preferredLanguage);
    }

    // Make API request to Groq
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Groq API error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage += ` - ${errorData.error?.message || errorData.message || 'Unknown error'}`;
      } catch {
        const errorText = await response.text();
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    if (!result.text || result.text.trim().length === 0) {
      throw new Error('No speech detected. Please try speaking more clearly.');
    }

    const detectedLanguage = result.language || 'unknown';
    
    // Validate that detected language is supported
    if (!isSupportedLanguage(detectedLanguage)) {
      console.warn(`Detected language ${detectedLanguage} is not in our supported Indian languages + English set`);
    }

    const languageName = getIndianLanguageName(detectedLanguage);
    const isIndian = isIndianLanguage(detectedLanguage);

    return {
      success: true,
      text: result.text.trim(),
      language: detectedLanguage,
      languageName: languageName,
      isIndianLanguage: isIndian,
      duration: result.duration,
      confidence: result.confidence
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed'
    };
  }
}

/**
 * Get filename based on MIME type
 * @param mimeType - MIME type of the audio
 * @returns string - Filename with appropriate extension
 */
function getFileName(mimeType: string): string {
  if (mimeType.includes('wav')) return 'audio.wav';
  if (mimeType.includes('mp4')) return 'audio.mp4';
  if (mimeType.includes('webm')) return 'audio.webm';
  return 'audio.wav'; // Default
}

/**
 * Utility function to check if the browser supports audio recording
 * @returns boolean - Whether audio recording is supported
 */
export function isAudioRecordingSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.MediaRecorder &&
    MediaRecorder.isTypeSupported
  );
}

/**
 * Transcribe an uploaded audio file (alternative to voice recording)
 * @param audioFile - File object containing audio data
 * @param preferredLanguage - Optional language hint
 * @returns Promise<TranscriptionResult> - The transcribed text, detected language, or error
 */
export async function transcribeAudioFile(
  audioFile: File, 
  preferredLanguage?: SupportedLanguageCode
): Promise<TranscriptionResult> {
  try {
    if (!audioFile.type.startsWith('audio/')) {
      throw new Error('File must be an audio file');
    }

    // Check file size (Groq has limits, typically 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      throw new Error('Audio file is too large. Maximum size is 25MB.');
    }

    const transcription = await transcribeAudioBlob(audioFile, preferredLanguage);
    return transcription;

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'File transcription failed'
    };
  }
}

/**
 * Get human-readable language name for Indian languages + English
 * @param languageCode - ISO language code
 * @returns string - Human-readable language name
 */
export function getIndianLanguageName(languageCode: string): string {
  const indianLanguageNames: { [key: string]: string } = {
    // English
    'en': 'English',
    
    // Major Indian Languages (officially supported by Whisper)
    'hi': 'हिन्दी (Hindi)',
    'bn': 'বাংলা (Bengali)',
    'te': 'తెలుగు (Telugu)',
    'mr': 'मराठी (Marathi)',
    'ta': 'தமிழ் (Tamil)',
    'gu': 'ગુજરાતી (Gujarati)',
    'kn': 'ಕನ್ನಡ (Kannada)',
    'ml': 'മലയാളം (Malayalam)',
    'or': 'ଓଡ଼ିଆ (Odia)',
    'pa': 'ਪੰਜਾਬੀ (Punjabi)',
    'as': 'অসমীয়া (Assamese)',
    'ur': 'اردو (Urdu)',
    'ne': 'नेपाली (Nepali)',
    'sa': 'संस्कृत (Sanskrit)',
    
    'unknown': 'Unknown Language'
  };

  const code = languageCode.toLowerCase().split('-')[0];
  return indianLanguageNames[code] || languageCode.toUpperCase();
}

/**
 * Check if a language code is an Indian language
 * @param languageCode - ISO language code
 * @returns boolean - Whether the language is Indian
 */
export function isIndianLanguage(languageCode: string): boolean {
  const indianLanguageCodes = [
    'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'or', 'pa', 'as', 'ur', 'ne', 'sa'
  ];
  
  const code = languageCode.toLowerCase().split('-')[0];
  return indianLanguageCodes.includes(code);
}

/**
 * Check if a language code is in our supported set
 * @param languageCode - ISO language code
 * @returns boolean - Whether the language is supported
 */
export function isSupportedLanguage(languageCode: string): boolean {
  const supportedCodes = [
    'en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'or', 'pa', 'as', 'ur', 'ne', 'sa'
  ];
  
  const code = languageCode.toLowerCase().split('-')[0];
  return supportedCodes.includes(code);
}

/**
 * Get list of all supported languages (Indian languages + English)
 * @returns Array of language objects with code and name
 */
export function getSupportedLanguages(): Array<{ 
  code: SupportedLanguageCode; 
  name: string; 
  nativeName: string;
  isIndian: boolean;
  script: string;
}> {
  return [
    { code: 'en', name: 'English', nativeName: 'English', isIndian: false, script: 'Latin' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', isIndian: true, script: 'Devanagari' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', isIndian: true, script: 'Bengali' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', isIndian: true, script: 'Telugu' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', isIndian: true, script: 'Devanagari' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', isIndian: true, script: 'Tamil' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', isIndian: true, script: 'Gujarati' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', isIndian: true, script: 'Kannada' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', isIndian: true, script: 'Malayalam' },
    { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', isIndian: true, script: 'Odia' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', isIndian: true, script: 'Gurmukhi' },
    { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', isIndian: true, script: 'Bengali' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', isIndian: true, script: 'Arabic' },
    { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', isIndian: true, script: 'Devanagari' },
    { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृत', isIndian: true, script: 'Devanagari' }
  ];
}

/**
 * Get Indian languages only (excluding English)
 * @returns Array of Indian language objects
 */
export function getIndianLanguages(): Array<{ 
  code: SupportedLanguageCode; 
  name: string; 
  nativeName: string;
  script: string;
}> {
  return getSupportedLanguages()
    .filter(lang => lang.isIndian)
    .map(({ code, name, nativeName, script }) => ({ code, name, nativeName, script }));
}

/**
 * Get supported audio file formats for upload
 * @returns Array of supported MIME types
 */
export function getSupportedAudioFormats(): string[] {
  return [
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/mp4',
    'audio/m4a',
    'audio/ogg',
    'audio/webm',
    'audio/flac'
  ];
}

/**
 * Validate if an audio file format is supported
 * @param file - File to validate
 * @returns boolean - Whether the file format is supported
 */
export function isValidAudioFile(file: File): boolean {
  const supportedFormats = getSupportedAudioFormats();
  return supportedFormats.some(format => 
    file.type === format || 
    file.type.startsWith(format.split('/')[0] + '/')
  );
}

/**
 * Get language statistics from transcription results
 * @param results - Array of transcription results
 * @returns Object with language usage statistics
 */
export function getLanguageStats(results: TranscriptionResult[]): {
  totalTranscriptions: number;
  englishCount: number;
  indianLanguageCount: number;
  languageBreakdown: { [key: string]: number };
  mostUsedLanguage: string;
} {
  const stats = {
    totalTranscriptions: results.length,
    englishCount: 0,
    indianLanguageCount: 0,
    languageBreakdown: {} as { [key: string]: number },
    mostUsedLanguage: 'none'
  };

  results.forEach(result => {
    if (result.success && result.language) {
      const lang = result.language;
      stats.languageBreakdown[lang] = (stats.languageBreakdown[lang] || 0) + 1;
      
      if (lang === 'en') {
        stats.englishCount++;
      } else if (isIndianLanguage(lang)) {
        stats.indianLanguageCount++;
      }
    }
  });

  // Find most used language
  let maxCount = 0;
  Object.entries(stats.languageBreakdown).forEach(([lang, count]) => {
    if (count > maxCount) {
      maxCount = count;
      stats.mostUsedLanguage = getIndianLanguageName(lang);
    }
  });

  return stats;
}