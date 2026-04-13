import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

export default function RatingStars({
  rating,
  size = 16,
  interactive = false,
  onRatingChange,
  showValue = true,
  count,
}) {
  const { colors } = useTheme();

  const renderStars = () => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 1; i <= 5; i++) {
      let starName = "star-outline";
      let starColor = colors.textSecondary;

      if (i <= fullStars) {
        starName = "star";
        starColor = colors.accent;
      } else if (i === fullStars + 1 && hasHalfStar) {
        starName = "star-half";
        starColor = colors.accent;
      }

      if (interactive) {
        stars.push(
          <TouchableOpacity
            key={i}
            onPress={() => onRatingChange && onRatingChange(i)}
            style={{ marginRight: 2 }}
          >
            <Ionicons name={starName} size={size} color={starColor} />
          </TouchableOpacity>,
        );
      } else {
        stars.push(
          <Ionicons
            key={i}
            name={starName}
            size={size}
            color={starColor}
            style={{ marginRight: 2 }}
          />,
        );
      }
    }

    return stars;
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {renderStars()}
      {showValue && (
        <Text
          style={{
            ...typography.body,
            color: colors.textPrimary,
            marginLeft: spacing.xs,
            fontSize: size - 2,
          }}
        >
          {rating.toFixed(1)}
          {count !== undefined && (
            <Text style={{ color: colors.textSecondary }}> ({count})</Text>
          )}
        </Text>
      )}
    </View>
  );
}
