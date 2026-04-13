import React, { useMemo, useRef } from "react";
import {
  Dimensions,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { spacing, radii, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import EmptyState from "../components/EmptyState";
import {
  fetchVendors,
  fetchDiscoveryHighlights,
  fetchEditorPicks,
  fetchHeroCards,
} from "../services/api";
import { useDataFetching } from "../hooks/useDataFetching";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function DiscoveryPage({ onVendorSelect, onNavigate }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [vendors, setVendors] = React.useState([]);
  const [heroCards, setHeroCards] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [randomEditorPicks, setRandomEditorPicks] = React.useState([]);
  const [currentHeroIndex, setCurrentHeroIndex] = React.useState(0);
  const heroScrollRef = useRef(null);

  // Fetch discovery data
  const { data: discoveryHighlightsData, loading: highlightsLoading } =
    useDataFetching(fetchDiscoveryHighlights);
  const { data: editorPicksData, loading: editorLoading } =
    useDataFetching(fetchEditorPicks);

  React.useEffect(() => {
    loadVendors();
    loadHeroCards();
  }, []);

  // Auto-scroll hero cards
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (heroScrollRef.current && heroCards.length > 0) {
        const nextIndex = (currentHeroIndex + 1) % heroCards.length;
        setCurrentHeroIndex(nextIndex);

        heroScrollRef.current.scrollTo({
          x: nextIndex * (SCREEN_WIDTH * 0.85 + spacing.md),
          animated: true,
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [currentHeroIndex, heroCards.length]);

  // Shuffle and select random vendors when vendors data changes
  React.useEffect(() => {
    if (vendors.length > 0) {
      const shuffled = [...vendors].sort(() => Math.random() - 0.5);
      setRandomEditorPicks(shuffled.slice(0, 6));
    }
  }, [vendors]);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const vendorsData = await fetchVendors("active");
      setVendors(vendorsData);
    } catch (error) {
      console.error("Error loading vendors:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadHeroCards = async () => {
    try {
      const cardsData = await fetchHeroCards();
      setHeroCards(cardsData);
    } catch (error) {
      console.error("Error loading hero cards:", error);
    }
  };

  const handleHeroCardAction = (card) => {
    if (card.action_type === "navigate") {
      console.log("Navigate to:", card.action_value);
      // Map action_value to page names and navigate
      if (onNavigate) {
        onNavigate(card.action_value);
      }
    } else if (card.action_type === "whatsapp") {
      const phoneNumber = card.whatsapp_number || "233509330098";
      const message = encodeURIComponent(
        card.whatsapp_message || "Hi Chawp Team, I'd like to know more.",
      );

      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
      const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;

      Linking.openURL(whatsappAppUrl)
        .catch(() => {
          Linking.openURL(whatsappUrl).catch(() => {
            const emailUrl = `mailto:support@chawp.com?subject=${encodeURIComponent(card.title || "Inquiry")}&body=${message}`;
            Linking.openURL(emailUrl);
          });
        })
        .catch((err) => {
          alert(
            "Unable to open contact. Please try again or contact support@chawp.com",
          );
        });
    } else if (card.action_type === "url" && card.action_value) {
      Linking.openURL(card.action_value).catch(() => {
        alert("Unable to open link");
      });
    }
  };

  const handleVendorPress = (vendor) => {
    if (onVendorSelect) {
      onVendorSelect(vendor);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.subtitle}>Discover</Text>
          <Text style={styles.title}>What's catching the night buzz</Text>
        </View>
      </View>

      {/* Hero Cards Section */}
      {heroCards.length > 0 && (
        <View style={styles.heroCardsContainer}>
          <ScrollView
            ref={heroScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.heroScrollContainer}
            decelerationRate="fast"
            onScroll={(event) => {
              const scrollX = event.nativeEvent.contentOffset.x;
              const cardWidth = SCREEN_WIDTH * 0.85 + spacing.md;
              const newIndex = Math.round(scrollX / cardWidth);
              if (
                newIndex !== currentHeroIndex &&
                newIndex >= 0 &&
                newIndex < heroCards.length
              ) {
                setCurrentHeroIndex(newIndex);
              }
            }}
            scrollEventThrottle={16}
          >
            {heroCards.map((card) => (
              <View key={card.id} style={styles.heroCardItem}>
                <LinearGradient
                  colors={[
                    card.gradient_start || colors.primaryMuted,
                    card.gradient_end || colors.primary,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.hero}
                >
                  <View style={styles.heroCopy}>
                    <Text
                      style={[styles.heroTitle, { color: colors.textPrimary }]}
                    >
                      {card.title}
                    </Text>
                    <Text
                      style={[
                        styles.heroSubtitle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {card.subtitle}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.heroButton,
                        { backgroundColor: colors.card },
                      ]}
                      onPress={() => handleHeroCardAction(card)}
                    >
                      <Text
                        style={[
                          styles.heroButtonText,
                          { color: colors.primary },
                        ]}
                      >
                        {card.button_text || "Learn More"}
                      </Text>
                      <Ionicons
                        name={card.icon || "arrow-forward"}
                        size={16}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  <Image
                    source={{ uri: card.image_url }}
                    style={styles.heroImage}
                  />
                </LinearGradient>
              </View>
            ))}
          </ScrollView>

          {/* Pagination Dots */}
          <View style={styles.heroPagination}>
            {heroCards.map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.heroDot,
                  currentHeroIndex === index && styles.heroDotActive,
                ]}
                onPress={() => {
                  setCurrentHeroIndex(index);
                  heroScrollRef.current?.scrollTo({
                    x: index * (SCREEN_WIDTH * 0.85 + spacing.md),
                    animated: true,
                  });
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* Default Hero Banner (shown when no hero cards) */}
      {heroCards.length === 0 && (
        <LinearGradient
          colors={[colors.primaryMuted, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCopy}>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
              Curated nightly journeys
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textPrimary }]}>
              Hand-picked experiences for nocturnal foodies ready to explore.
            </Text>
            <TouchableOpacity
              style={[styles.heroButton, { backgroundColor: colors.card }]}
              onPress={() => {
                // Scroll to editor's picks section
                console.log("Exploring curated vendors");
              }}
            >
              <Text style={[styles.heroButtonText, { color: colors.primary }]}>
                Start exploring
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=80",
            }}
            style={styles.heroImage}
          />
        </LinearGradient>
      )}

      <SectionHeader
        title="Nightly highlights"
        colors={colors}
        styles={styles}
      />
      <View style={styles.highlightList}>
        {(discoveryHighlightsData || []).map((collection) => (
          <View key={collection.id} style={styles.highlightCard}>
            <Image
              source={{ uri: collection.image }}
              style={styles.highlightImage}
            />
            <View style={styles.highlightBody}>
              <Text style={styles.highlightTitle}>{collection.title}</Text>
              <Text style={styles.highlightText}>{collection.description}</Text>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader title="Editor's picks" colors={colors} styles={styles} />
      <View style={styles.editorGrid}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading vendors...</Text>
          </View>
        ) : randomEditorPicks.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="No editor's picks available"
            message="Our curated selection will appear here once vendors are added"
            style={{ width: "100%" }}
          />
        ) : (
          randomEditorPicks.map((vendor) => (
            <TouchableOpacity
              key={vendor.id}
              style={[
                styles.editorCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => handleVendorPress(vendor)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: vendor.image }}
                style={styles.editorImage}
              />
              <View style={styles.editorBody}>
                <Text style={styles.editorTitle}>{vendor.name}</Text>
                <View style={styles.tagRow}>
                  {vendor.tags &&
                    vendor.tags.length > 0 &&
                    vendor.tags.map((tag) => (
                      <View key={tag} style={styles.tagPill}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                </View>
                <View style={styles.metaRow}>
                  <Ionicons
                    name="location"
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.metaText}>
                    {vendor.distance || "N/A"}
                  </Text>
                  <View style={styles.dot} />
                  <Ionicons name="star" size={14} color={colors.accent} />
                  <Text style={styles.metaText}>
                    {vendor.rating ? vendor.rating.toFixed(1) : "N/A"}
                  </Text>
                  <View style={styles.dot} />
                  <Text style={styles.metaText}>
                    {vendor.delivery_time || "N/A"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function SectionHeader({ title, actionLabel, onActionPress, colors, styles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity
          style={styles.sectionAction}
          onPress={
            onActionPress ||
            (() => console.log(`${title} - ${actionLabel} pressed`))
          }
        >
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      paddingBottom: 50,
      gap: spacing.xl,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      ...typography.headline,
      color: colors.textPrimary,
      marginTop: spacing.xs,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    hero: {
      borderRadius: radii.lg,
      padding: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
    },
    heroCopy: {
      flex: 1,
      gap: spacing.sm,
    },
    heroTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 20,
    },
    heroSubtitle: {
      color: colors.textPrimary,
      opacity: 0.85,
      lineHeight: 20,
    },
    heroButton: {
      marginTop: spacing.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    heroButtonText: {
      color: colors.primary,
      fontWeight: "700",
      fontSize: 14,
    },
    heroImage: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 2,
      borderColor: colors.border + "66",
    },
    heroCardsContainer: {
      marginVertical: spacing.md,
    },
    heroScrollContainer: {
      gap: spacing.md,
    },
    heroCardItem: {
      width: SCREEN_WIDTH * 0.85,
    },
    heroPagination: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    heroDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.textMuted,
      opacity: 0.5,
    },
    heroDotActive: {
      backgroundColor: colors.primary,
      opacity: 1,
      transform: [{ scaleX: 1.5 }],
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    sectionAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    sectionActionText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },
    highlightList: {
      gap: spacing.lg,
    },
    highlightCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    highlightImage: {
      width: "100%",
      height: 160,
    },
    highlightBody: {
      padding: spacing.lg,
      gap: spacing.xs,
    },
    highlightTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    highlightText: {
      color: colors.textSecondary,
      lineHeight: 18,
    },
    editorGrid: {
      gap: spacing.lg,
    },
    editorCard: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    editorImage: {
      width: "100%",
      height: 150,
    },
    editorBody: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    editorTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    tagPill: {
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    tagText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    metaText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: spacing.xl,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });
