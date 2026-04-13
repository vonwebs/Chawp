import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

import { useTheme } from "../contexts/ThemeContext";

export default function LoadingPlaceholder({
  width = 80,
  height = 12,
  borderRadius = 8,
  style,
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.placeholder,
        {
          width,
          height,
          borderRadius,
          opacity,
          backgroundColor: colors.textMuted,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    // backgroundColor is applied inline for theme reactivity
  },
});
