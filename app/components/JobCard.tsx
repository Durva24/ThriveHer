import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface JobData {
  employer_logo: string;
  job_title: string;
  employer_name: string;
  job_apply_link: string;
  job_employment_type: string;
  job_posted_at_datetime_utc: string;
}

interface JobDetailCardProps {
  message: string;
  onSelectCommand?: (command: string) => void;
  onExampleClick?: (fullCommand: string) => void;
}

const JobDetailCard: React.FC<JobDetailCardProps> = ({ 
  message, 
  onSelectCommand = () => {}, 
  onExampleClick = () => {} 
}) => {
  // Parse job data from message
  const parseJobData = (message: string): JobData[] => {
    try {
      // Look for /jobdata command followed by JSON
      const jobDataMatch = message.match(/\/jobdata\s*(\[.*\])/s);
      if (jobDataMatch) {
        return JSON.parse(jobDataMatch[1]);
      }
      return [];
    } catch (error) {
      console.error('Error parsing job data:', error);
      return [];
    }
  };

  // Get favicon URL from apply link
  const getFaviconFromApplyLink = (applyLink: string): string => {
    try {
      const url = new URL(applyLink);
      return `${url.protocol}//${url.hostname}/favicon.ico`;
    } catch (error) {
      console.error('Error extracting favicon from apply link:', error);
      return 'https://via.placeholder.com/50x50?text=Logo';
    }
  };

  // Get favicon URL from employer logo URL
  const getFaviconFromEmployerLogo = (employerLogo: string): string => {
    try {
      const url = new URL(employerLogo);
      return `${url.protocol}//${url.hostname}/favicon.ico`;
    } catch (error) {
      console.error('Error extracting favicon from employer logo:', error);
      return 'https://via.placeholder.com/50x50?text=Logo';
    }
  };

  // Get appropriate favicon URL - prioritize apply link, fallback to employer logo domain
  const getFaviconUrl = (job: JobData): string => {
    // First try to get favicon from apply link
    if (job.job_apply_link) {
      return getFaviconFromApplyLink(job.job_apply_link);
    }
    
    // Fallback to employer logo domain if apply link is not available
    if (job.employer_logo) {
      return getFaviconFromEmployerLogo(job.employer_logo);
    }
    
    // Final fallback
    return 'https://via.placeholder.com/50x50?text=Logo';
  };

  // Format date to readable format
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return 'Date not available';
    }
  };

  // Handle apply button press
  const handleApply = async (applyLink: string) => {
    try {
      const supported = await Linking.canOpenURL(applyLink);
      if (supported) {
        await Linking.openURL(applyLink);
      } else {
        console.error("Can't open URL:", applyLink);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  // Check if message contains /jobdetail command
  const isJobDetailCommand = message.toLowerCase().includes('/jobdata');
  const jobData = parseJobData(message);

  // If not a job detail command or no job data, don't render anything
  if (!isJobDetailCommand || jobData.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {jobData.map((job, index) => (
          <View key={index} style={styles.jobCard}>
            {/* Header with logo and basic info */}
            <View style={styles.headerContainer}>
              <Image 
                source={{ uri: getFaviconUrl(job) }} 
                style={styles.companyLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=Logo' }}
                onError={() => {
                  console.log('Failed to load favicon, using fallback');
                }}
              />
              <View style={styles.headerTextContainer}>
                <Text style={styles.jobTitle} numberOfLines={2}>
                  {job.job_title}
                </Text>
                <Text style={styles.companyName}>
                  {job.employer_name}
                </Text>
              </View>
            </View>

            {/* Job details */}
            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <MaterialIcons name="work" size={16} color="#49654E" />
                <Text style={styles.detailText}>{job.job_employment_type}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <MaterialIcons name="schedule" size={16} color="#49654E" />
                <Text style={styles.detailText}>
                  Posted on {formatDate(job.job_posted_at_datetime_utc)}
                </Text>
              </View>
            </View>

            {/* Apply button */}
            <TouchableOpacity 
              style={styles.applyButton}
              onPress={() => handleApply(job.job_apply_link)}
            >
              <MaterialIcons name="open-in-new" size={18} color="#FFFFFF" />
              <Text style={styles.applyButtonText}>Apply Now</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    margin: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 400,
  },
  scrollView: {
    maxHeight: 400,
  },
  jobCard: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  companyLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F5F5F5',
  },
  headerTextContainer: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#253528',
    lineHeight: 24,
    marginBottom: 4,
  },
  companyName: {
    fontSize: 16,
    color: '#49654E',
    fontWeight: '500',
  },
  detailsContainer: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666666',
    marginLeft: 8,
  },
  applyButton: {
    backgroundColor: '#49654E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default JobDetailCard;