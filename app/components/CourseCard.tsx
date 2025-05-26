import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  Linking 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface CourseData {
  name: string;
  platform: string;
  link: string;
}

interface CourseCardProps {
  message: string;
}

const CourseCard: React.FC<CourseCardProps> = ({ message }) => {
  // Parse course data from message
  const parseCourseData = (message: string): CourseData[] => {
    try {
      // Look for /courses command followed by data
      const lines = message.split('\n');
      const courses: CourseData[] = [];
      
      let foundCommand = false;
      for (const line of lines) {
        if (line.trim().toLowerCase() === '/courses') {
          foundCommand = true;
          continue;
        }
        
        if (foundCommand && line.trim()) {
          const parts = line.split(':');
          if (parts.length >= 3) {
            const name = parts[0].trim();
            const platform = parts[1].trim();
            const link = parts.slice(2).join(':').trim(); // Handle URLs with colons
            
            courses.push({ name, platform, link });
          }
        }
      }
      
      return courses;
    } catch (error) {
      console.error('Error parsing course data:', error);
      return [];
    }
  };

  // Get favicon URL for a given website
  const getFaviconUrl = (url: string): string => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      return 'https://via.placeholder.com/50x50?text=📚';
    }
  };

  // Get platform icon based on platform name (updated with all API platforms)
  const getPlatformIcon = (platform: string): string => {
    const platformLower = platform.toLowerCase();
    
    switch (platformLower) {
      case 'coursera':
        return 'school';
      case 'udemy':
        return 'play-circle-filled';
      case 'edx':
        return 'menu-book';
      case 'khan academy':
        return 'lightbulb';
      case 'linkedin learning':
        return 'business';
      case 'pluralsight':
        return 'computer';
      case 'codecademy':
        return 'code';
      case 'freecodecamp':
        return 'code';
      case 'youtube':
        return 'play-circle-filled';
      case 'skillshare':
        return 'palette';
      default:
        return 'book';
    }
  };

  // Get platform color based on platform name (updated with all API platforms)
  const getPlatformColor = (platform: string): string => {
    const platformLower = platform.toLowerCase();
    
    switch (platformLower) {
      case 'coursera':
        return '#0056D3';
      case 'udemy':
        return '#A435F0';
      case 'edx':
        return '#02262B';
      case 'khan academy':
        return '#14BF96';
      case 'linkedin learning':
        return '#0A66C2';
      case 'pluralsight':
        return '#F15B2A';
      case 'codecademy':
        return '#1F4056';
      case 'freecodecamp':
        return '#006400';
      case 'youtube':
        return '#FF0000';
      case 'skillshare':
        return '#00FF88';
      default:
        return '#49654E';
    }
  };

  // Get difficulty level indicator (simplified logic based on platform)
  const getDifficultyLevel = (platform: string, courseName: string): string => {
    const nameLower = courseName.toLowerCase();
    const platformLower = platform.toLowerCase();
    
    if (nameLower.includes('beginner') || nameLower.includes('basics') || nameLower.includes('introduction')) {
      return 'Beginner';
    } else if (nameLower.includes('advanced') || nameLower.includes('master')) {
      return 'Advanced';
    } else if (platformLower === 'youtube' || platformLower === 'freecodecamp' || platformLower === 'khan academy') {
      return 'Free';
    } else if (platformLower === 'coursera' || platformLower === 'edx') {
      return 'Academic';
    } else {
      return 'Intermediate';
    }
  };

  // Get difficulty color
  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty) {
      case 'Beginner':
        return '#4CAF50';
      case 'Intermediate':
        return '#FF9800';
      case 'Advanced':
        return '#F44336';
      case 'Free':
        return '#9C27B0';
      case 'Academic':
        return '#3F51B5';
      default:
        return '#49654E';
    }
  };

  // Handle course link press
  const handleCoursePress = async (link: string) => {
    try {
      const supported = await Linking.canOpenURL(link);
      if (supported) {
        await Linking.openURL(link);
      } else {
        console.error("Can't open URL:", link);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  // Check if message contains /courses command
  const isCoursesCommand = message.toLowerCase().includes('/courses');
  const courseData = parseCourseData(message);

  // If not a courses command or no course data, don't render anything
  if (!isCoursesCommand || courseData.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <MaterialIcons name="school" size={24} color="#49654E" />
        <Text style={styles.headerTitle}>Learning Courses</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{courseData.length}</Text>
        </View>
      </View>
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {courseData.map((course, index) => {
          const difficulty = getDifficultyLevel(course.platform, course.name);
          return (
            <TouchableOpacity 
              key={index} 
              style={styles.courseCard}
              onPress={() => handleCoursePress(course.link)}
              activeOpacity={0.7}
            >
              {/* Header with favicon and basic info */}
              <View style={styles.cardHeader}>
                <Image 
                  source={{ uri: getFaviconUrl(course.link) }} 
                  style={styles.courseLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=📚' }}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={styles.courseName} numberOfLines={2}>
                    {course.name}
                  </Text>
                  <View style={styles.courseInfoRow}>
                    <View style={styles.platformContainer}>
                      <MaterialIcons 
                        name={getPlatformIcon(course.platform) as any} 
                        size={16} 
                        color={getPlatformColor(course.platform)} 
                      />
                      <Text style={[styles.platformText, { color: getPlatformColor(course.platform) }]}>
                        {course.platform}
                      </Text>
                    </View>
                    <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(difficulty) + '20' }]}>
                      <Text style={[styles.difficultyText, { color: getDifficultyColor(difficulty) }]}>
                        {difficulty}
                      </Text>
                    </View>
                  </View>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={16} color="#CCCCCC" />
              </View>

              {/* Link preview */}
              <View style={styles.linkContainer}>
                <MaterialIcons name="link" size={14} color="#888888" />
                <Text style={styles.linkText} numberOfLines={1}>
                  {course.link}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
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
    maxHeight: 500,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#253528',
    marginLeft: 8,
    flex: 1,
  },
  headerBadge: {
    backgroundColor: '#49654E',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    maxHeight: 400,
  },
  courseCard: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  courseLogo: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F5F5F5',
  },
  cardTextContainer: {
    flex: 1,
  },
  courseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#253528',
    lineHeight: 22,
    marginBottom: 6,
  },
  courseInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  platformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  platformText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  linkText: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 6,
    flex: 1,
  },
});

export default CourseCard;