import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing, radii, typography } from "../theme";
import RatingStars from "./RatingStars";
import { fetchComments, submitComment } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { useTheme } from "../contexts/ThemeContext";

export default function CommentsSection({ targetType, targetId }) {
  const { colors } = useTheme();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [newRating, setNewRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const notification = useNotification();

  useEffect(() => {
    loadComments();
  }, [targetType, targetId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const data = await fetchComments(targetType, targetId);
      setComments(data);
    } catch (error) {
      console.error("Error loading comments:", error);
      notification.error("Error", "Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!isAuthenticated) {
      notification.error("Error", "Please sign in to leave a review");
      return;
    }

    if (!newComment.trim()) {
      notification.warning("Error", "Please enter a comment");
      return;
    }

    try {
      setSubmitting(true);
      await submitComment(
        targetType,
        targetId,
        newComment.trim(),
        newRating > 0 ? newRating : null,
      );

      setNewComment("");
      setNewRating(0);
      await loadComments(); // Refresh comments
      notification.success("Success", "Review submitted!");
    } catch (error) {
      console.error("Error submitting comment:", error);
      notification.error("Error", "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const renderComment = ({ item }) => (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.xs,
        }}
      >
        <Text
          style={{
            ...typography.title,
            color: colors.textPrimary,
            fontWeight: "600",
          }}
        >
          {item.user?.full_name || item.user?.username || "Anonymous"}
        </Text>
        <Text
          style={{
            ...typography.body,
            color: colors.textSecondary,
            fontSize: 12,
          }}
        >
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>

      {item.rating && (
        <RatingStars
          rating={item.rating}
          size={14}
          showValue={false}
          style={{ marginBottom: spacing.xs }}
        />
      )}

      <Text
        style={{
          ...typography.body,
          color: colors.textPrimary,
          lineHeight: 20,
        }}
      >
        {item.comment}
      </Text>
    </View>
  );

  return (
    <View>
      {/* Add Comment Section - Only show if authenticated */}
      {isAuthenticated && (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: radii.md,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Text
            style={{
              ...typography.title,
              color: colors.textPrimary,
              marginBottom: spacing.sm,
              fontWeight: "600",
            }}
          >
            Add a Review
          </Text>

          {/* Rating Input */}
          <View style={{ marginBottom: spacing.sm }}>
            <Text
              style={{
                ...typography.body,
                color: colors.textSecondary,
                marginBottom: spacing.xs,
              }}
            >
              Rating (optional)
            </Text>
            <RatingStars
              rating={newRating}
              interactive={true}
              onRatingChange={setNewRating}
              showValue={false}
            />
          </View>

          {/* Comment Input */}
          <TextInput
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.sm,
              padding: spacing.sm,
              color: colors.textPrimary,
              minHeight: 80,
              textAlignVertical: "top",
              marginBottom: spacing.sm,
            }}
            placeholder="Share your thoughts..."
            placeholderTextColor={colors.textSecondary}
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />

          <TouchableOpacity
            style={{
              backgroundColor: submitting
                ? colors.textSecondary
                : colors.primary,
              borderRadius: radii.pill,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              alignSelf: "flex-start",
              opacity: submitting ? 0.6 : 1,
            }}
            onPress={handleSubmitComment}
            disabled={submitting}
          >
            <Text
              style={{
                ...typography.body,
                color: colors.card,
                fontWeight: "600",
              }}
            >
              {submitting ? "Submitting..." : "Submit Review"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sign in prompt - Only show if not authenticated */}
      {!isAuthenticated && (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: radii.md,
            padding: spacing.md,
            marginBottom: spacing.lg,
            alignItems: "center",
          }}
        >
          <Ionicons
            name="person-outline"
            size={48}
            color={colors.textSecondary}
            style={{ marginBottom: spacing.sm }}
          />
          <Text
            style={{
              ...typography.title,
              color: colors.textPrimary,
              marginBottom: spacing.xs,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            Sign in to leave a review
          </Text>
          <Text
            style={{
              ...typography.body,
              color: colors.textSecondary,
              textAlign: "center",
            }}
          >
            Join the community and share your thoughts about this place!
          </Text>
        </View>
      )}

      {/* Comments List */}
      <View>
        <Text
          style={{
            ...typography.headline,
            color: colors.textPrimary,
            marginBottom: spacing.md,
          }}
        >
          Reviews ({comments.length})
        </Text>

        {loading ? (
          <Text
            style={{
              ...typography.body,
              color: colors.textSecondary,
              textAlign: "center",
              padding: spacing.lg,
            }}
          >
            Loading reviews...
          </Text>
        ) : comments.length === 0 ? (
          <Text
            style={{
              ...typography.body,
              color: colors.textSecondary,
              textAlign: "center",
              padding: spacing.lg,
            }}
          >
            No reviews yet. Be the first to leave one!
          </Text>
        ) : (
          <FlatList
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
          />
        )}
      </View>
    </View>
  );
}
