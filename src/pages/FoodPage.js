import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { spacing, radii, typography, responsive } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { getAverageRating } from "../services/api";
import RatingStars from "../components/RatingStars";
import CommentsSection from "../components/CommentsSection";
import LoadingPlaceholder from "../components/LoadingPlaceholder";

const NO_SIZE_OPTION_KEY = "none";

const normalizeSizeValue = (size) => {
  if (typeof size !== "string") return null;
  const normalized = size.trim().toLowerCase();
  return normalized || null;
};

const normalizeOptionLabel = (option) => {
  if (typeof option === "string") {
    const trimmed = option.trim();
    return trimmed || null;
  }

  if (option && typeof option === "object") {
    const candidate =
      option.value || option.name || option.label || option.size || option.spec;
    const trimmed = String(candidate || "").trim();
    return trimmed || null;
  }

  return null;
};

const normalizeSpecificationOptions = (specifications = []) => {
  if (!Array.isArray(specifications)) return [];

  return [
    ...new Set(
      specifications
        .map((spec) => normalizeOptionLabel(spec))
        .filter(Boolean)
        .map((spec) => String(spec || "").trim()),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const normalizePriceAdjustments = (
  priceMap = {},
  normalizeKey = (key) => key,
) => {
  if (!priceMap || typeof priceMap !== "object" || Array.isArray(priceMap)) {
    return {};
  }

  const normalized = {};
  Object.entries(priceMap).forEach(([key, rawValue]) => {
    const normalizedKey = normalizeKey(String(key || "").trim());
    const value = Number(rawValue);
    if (!normalizedKey || !Number.isFinite(value) || value <= 0) return;
    normalized[normalizedKey] = Number(value.toFixed(2));
  });
  return normalized;
};

const getMealPricingDetails = (
  meal = {},
  selectedSize = null,
  selectedSpecifications = [],
) => {
  const basePrice = Number(meal?.price || 0);
  const normalizedBasePrice = Number.isFinite(basePrice) ? basePrice : 0;

  const sizePriceMap = normalizePriceAdjustments(
    meal?.size_prices || {},
    (sizeKey) => normalizeSizeValue(sizeKey),
  );
  const specificationPriceMap = normalizePriceAdjustments(
    meal?.specification_prices || {},
    (specKey) => specKey.trim().toLowerCase(),
  );

  const normalizedSize = normalizeSizeValue(selectedSize);
  const normalizedSpecifications = normalizeSpecificationOptions(
    selectedSpecifications,
  );

  const sizeAdjustment = normalizedSize
    ? Number(sizePriceMap[normalizedSize] || 0)
    : 0;
  const specificationAdjustment = normalizedSpecifications.reduce(
    (sum, specification) =>
      sum +
      Number(
        specificationPriceMap[String(specification).trim().toLowerCase()] || 0,
      ),
    0,
  );

  const unitPrice = Number(
    (normalizedBasePrice + sizeAdjustment + specificationAdjustment).toFixed(2),
  );

  return {
    basePrice: Number(normalizedBasePrice.toFixed(2)),
    sizeAdjustment: Number(sizeAdjustment.toFixed(2)),
    specificationAdjustment: Number(specificationAdjustment.toFixed(2)),
    totalAdjustment: Number(
      (sizeAdjustment + specificationAdjustment).toFixed(2),
    ),
    unitPrice,
  };
};

const formatSizeLabel = (size) =>
  (normalizeSizeValue(size) || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const buildOptionsKey = (size, specifications = []) => {
  const normalizedSize = normalizeSizeValue(size);
  const normalizedSpecs = normalizeSpecificationOptions(specifications);
  const sizeKey = normalizedSize || NO_SIZE_OPTION_KEY;
  return `${sizeKey}::${normalizedSpecs.join("|")}`;
};

const isVendorUnavailable = (vendor = {}) => {
  const normalizedStatus = String(
    vendor?.operational_status || vendor?.status || "",
  ).toLowerCase();

  const closedStatuses = [
    "closed",
    "inactive",
    "suspended",
    "temporarily_closed",
  ];

  const isClosedToday =
    vendor?.is_closed_today === true ||
    String(vendor?.is_closed_today || "").toLowerCase() === "true" ||
    Number(vendor?.is_closed_today) === 1;

  const hasClosedOpenFlag =
    vendor?.is_open === false || vendor?.currently_open === false;

  return (
    closedStatuses.includes(normalizedStatus) ||
    isClosedToday ||
    hasClosedOpenFlag
  );
};

export default function FoodPage({
  meal,
  vendorContext = null,
  onAddToCart,
  onClose,
  cartItems,
  updateCartQuantity,
  isAddingToCart = false,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ratingInfo, setRatingInfo] = useState({ average: 0, count: 0 });
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [customizationVisible, setCustomizationVisible] = useState(false);
  const effectiveVendor = meal.vendor || vendorContext || {};
  const isVendorClosed = isVendorUnavailable(effectiveVendor);

  const mealImages =
    Array.isArray(meal.images) && meal.images.length
      ? meal.images
      : meal.image
        ? [meal.image]
        : [
            "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?auto=format&fit=crop&w=900&q=80",
          ];

  const mealSpecifications = normalizeSpecificationOptions(
    Array.isArray(meal.specifications)
      ? meal.specifications
      : meal.specifications
        ? [normalizeOptionLabel(meal.specifications)].filter(Boolean)
        : [],
  );

  const mealSizeOptions = React.useMemo(() => {
    const hasExplicitSizes =
      Array.isArray(meal.sizes) || Array.isArray(meal.available_sizes);

    const configuredSizes = Array.isArray(meal.sizes)
      ? meal.sizes
      : Array.isArray(meal.available_sizes)
        ? meal.available_sizes
        : [];

    const normalizedConfiguredSizes = [
      ...new Set(
        configuredSizes
          .map((size) => normalizeOptionLabel(size))
          .map((size) => normalizeSizeValue(size)),
      ),
    ].filter(Boolean);

    if (hasExplicitSizes) {
      return normalizedConfiguredSizes;
    }

    const mealSize = normalizeSizeValue(meal.size);

    if (mealSize) {
      return [mealSize];
    }

    return [];
  }, [meal.sizes, meal.available_sizes, meal.size]);

  const [selectedSize, setSelectedSize] = useState(
    () => mealSizeOptions[0] || null,
  );
  const [selectedSpecifications, setSelectedSpecifications] = useState([]);

  const hasCustomizationChoices =
    mealSizeOptions.length > 1 || mealSpecifications.length > 0;

  const pricingDetails = React.useMemo(
    () => getMealPricingDetails(meal, selectedSize, selectedSpecifications),
    [meal, selectedSize, selectedSpecifications],
  );

  const selectedOptionsKey = buildOptionsKey(
    selectedSize,
    selectedSpecifications,
  );

  const cartItem = cartItems.find((item) => {
    const sameMeal = item.meal_id === meal.id || item.meal?.id === meal.id;
    if (!sameMeal) return false;

    const fallbackMealSize =
      Array.isArray(item.meal?.sizes) ||
      Array.isArray(item.meal?.available_sizes)
        ? null
        : item.meal?.size;

    const itemOptionsKey =
      item.options_key ||
      buildOptionsKey(
        item.selected_size || fallbackMealSize,
        item.selected_specifications || [],
      );

    return itemOptionsKey === selectedOptionsKey;
  });

  const quantity = cartItem?.quantity || 0;
  const totalMealQuantity = cartItems
    .filter((item) => item.meal_id === meal.id || item.meal?.id === meal.id)
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  useEffect(() => {
    loadMealData();
  }, [meal.id]);

  useEffect(() => {
    const preferredSize = normalizeSizeValue(meal.size);
    const nextSize = mealSizeOptions.includes(preferredSize)
      ? preferredSize
      : mealSizeOptions[0] || null;

    setSelectedSize(nextSize);
    setSelectedSpecifications([]);
    setCustomizationVisible(false);
  }, [meal.id, meal.size, mealSizeOptions]);

  const loadMealData = async () => {
    try {
      const rating = await getAverageRating("meal", meal.id);
      setRatingInfo(rating);
    } catch (error) {
      console.error("Error loading meal data:", error);
    }
  };

  const handleAddToCart = () => {
    if (isVendorClosed) {
      return; // Prevent adding to cart if vendor is closed
    }

    const mealWithVendor = {
      ...meal,
      vendor: {
        ...effectiveVendor,
        ...(meal.vendor || {}),
      },
    };

    if (!hasCustomizationChoices) {
      const autoSelectedSize = mealSizeOptions[0] || null;
      const autoSelectedSpecifications = [];

      onAddToCart(mealWithVendor, {
        selectedSize: autoSelectedSize,
        selectedSpecifications: autoSelectedSpecifications,
        optionsKey: buildOptionsKey(
          autoSelectedSize,
          autoSelectedSpecifications,
        ),
      });
      return;
    }

    setCustomizationVisible(true);
  };

  const handleConfirmAddToCart = () => {
    if (isVendorClosed || isAddingToCart) {
      return;
    }

    const mealWithVendor = {
      ...meal,
      vendor: {
        ...effectiveVendor,
        ...(meal.vendor || {}),
      },
    };

    onAddToCart(mealWithVendor, {
      selectedSize,
      selectedSpecifications,
      optionsKey: selectedOptionsKey,
    });
    setCustomizationVisible(false);
  };

  const handleUpdateQuantity = (delta) => {
    if (cartItem) {
      updateCartQuantity(cartItem.id, delta);
    }
  };

  const openFullscreenPreview = (index) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  const handleImageMomentumScroll = (event, setIndex) => {
    const x = event.nativeEvent.contentOffset.x;
    const width = event.nativeEvent.layoutMeasurement.width;
    const index = Math.round(x / width);
    setIndex(index);
  };

  const toggleSpecificationSelection = (specification) => {
    const normalizedSpec = String(specification || "").trim();
    if (!normalizedSpec) return;

    setSelectedSpecifications((prev) => {
      if (prev.includes(normalizedSpec)) {
        return prev.filter((item) => item !== normalizedSpec);
      }

      return normalizeSpecificationOptions([...prev, normalizedSpec]);
    });
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.fixedHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <FlatList
            data={mealImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item}-${index}`}
            onMomentumScrollEnd={(event) =>
              handleImageMomentumScroll(event, setActiveImageIndex)
            }
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => openFullscreenPreview(index)}
              >
                <Image source={{ uri: item }} style={styles.heroImage} />
              </TouchableOpacity>
            )}
          />
          {mealImages.length > 1 && (
            <View style={styles.imageDots}>
              {mealImages.map((_, index) => (
                <View
                  key={`hero-dot-${index}`}
                  style={[
                    styles.imageDot,
                    index === activeImageIndex && styles.imageDotActive,
                  ]}
                />
              ))}
            </View>
          )}
          {isVendorClosed && (
            <View style={styles.closedOverlay}>
              <View style={styles.closedBadge}>
                <Ionicons name="lock-closed" size={20} color={colors.card} />
                <Text style={styles.closedText}>Vendor Closed</Text>
              </View>
            </View>
          )}
          <LinearGradient
            colors={["transparent", "rgba(7, 11, 22, 0.8)"]}
            style={styles.heroGradient}
          >
            <View style={styles.heroContent}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>
                  {meal.category || "Quick Bite"}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Content */}
        <View style={styles.mainContent}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>{meal.title}</Text>
            <View style={styles.metaRow}>
              <RatingStars
                rating={ratingInfo.average || 0}
                size={16}
                count={ratingInfo.count}
              />
              <View style={styles.dot} />
              <Ionicons
                name="time-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.metaText}>{meal.time}</Text>
              <View style={styles.dot} />
              <Ionicons
                name="flame-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.metaText}>{meal.calories}</Text>
            </View>
          </View>

          <View style={styles.vendorSection}>
            <Text style={styles.sectionTitle}>From</Text>
            <View style={styles.vendorCard}>
              <Image
                source={{
                  uri:
                    meal.vendor?.image ||
                    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
                }}
                style={styles.vendorImage}
              />
              <View style={styles.vendorInfo}>
                <Text style={styles.vendorName}>
                  {meal.vendor?.name || "Quick Bites"}
                </Text>
                <View style={styles.vendorMeta}>
                  <Ionicons name="star" size={14} color={colors.accent} />
                  <Text style={styles.vendorRating}>
                    {meal.vendor?.rating
                      ? meal.vendor.rating.toFixed(1)
                      : "4.5"}
                  </Text>
                  <View style={styles.dot} />
                  <Text style={styles.vendorMetaText}>
                    {meal.vendor?.delivery_time || "15-25 min"}
                  </Text>
                  <View style={styles.dot} />
                  <Text style={styles.vendorMetaText}>
                    {meal.vendor?.distance || "1.2 km"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.vendorButton}>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>
              {meal.description ||
                "A delicious quick bite perfect for satisfying your late-night cravings. Made with fresh ingredients and prepared with care."}
            </Text>
          </View>

          {mealSizeOptions.length > 0 && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Size</Text>
              <View style={styles.optionChipWrap}>
                {mealSizeOptions.map((sizeOption) => {
                  const active = selectedSize === sizeOption;

                  return (
                    <TouchableOpacity
                      key={`size-${sizeOption}`}
                      style={[
                        styles.optionChip,
                        active && styles.optionChipActive,
                      ]}
                      onPress={() => setSelectedSize(sizeOption)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {formatSizeLabel(sizeOption)}
                        {(() => {
                          const sizePrice = getMealPricingDetails(
                            meal,
                            sizeOption,
                            [],
                          ).sizeAdjustment;
                          return sizePrice > 0
                            ? ` (+GH₵${sizePrice.toFixed(2)})`
                            : "";
                        })()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedSize ? (
                <Text style={styles.optionHintText}>
                  Selected size for cart: {formatSizeLabel(selectedSize)}
                </Text>
              ) : null}
            </View>
          )}

          {mealSpecifications.length > 0 && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Specifications</Text>
              <Text style={styles.optionHintText}>
                Tap to choose multiple specifications.
              </Text>
              <View style={styles.specificationsList}>
                {mealSpecifications.map((spec, index) => {
                  const selected = selectedSpecifications.includes(spec);

                  return (
                    <TouchableOpacity
                      key={`meal-spec-${index}`}
                      style={[
                        styles.specificationItem,
                        selected && styles.specificationItemActive,
                      ]}
                      onPress={() => toggleSpecificationSelection(spec)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={16}
                        color={selected ? colors.success : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.specificationText,
                          selected && styles.specificationTextActive,
                        ]}
                      >
                        {spec}
                        {(() => {
                          const specificationPrice = getMealPricingDetails(
                            meal,
                            null,
                            [spec],
                          ).specificationAdjustment;
                          return specificationPrice > 0
                            ? ` (+GH₵${specificationPrice.toFixed(2)})`
                            : "";
                        })()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {meal.ingredients && meal.ingredients.length > 0 && (
            <View style={styles.ingredientsSection}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <View style={styles.ingredientsList}>
                {meal.ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientTag}>
                    <Text style={styles.ingredientText}>{ingredient}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        </View>

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <CommentsSection targetType="meal" targetId={meal.id} />
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.priceSection}>
          <View>
            <Text style={styles.price}>
              GH₵{pricingDetails.unitPrice.toFixed(2)}
            </Text>
            {selectedSize || totalMealQuantity > quantity ? (
              <Text style={styles.priceMetaText}>
                {selectedSize ? `Size: ${formatSizeLabel(selectedSize)}` : ""}
                {selectedSize && totalMealQuantity > quantity ? " • " : ""}
                {totalMealQuantity > quantity
                  ? `Total in cart: ${totalMealQuantity}`
                  : ""}
              </Text>
            ) : null}
            {pricingDetails.totalAdjustment > 0 ? (
              <Text style={styles.priceMetaText}>
                Includes +GH₵{pricingDetails.totalAdjustment.toFixed(2)} options
              </Text>
            ) : null}
          </View>
          {quantity > 0 && (
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => handleUpdateQuantity(-1)}
              >
                <Ionicons name="remove" size={16} color={colors.card} />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => handleUpdateQuantity(1)}
              >
                <Ionicons name="add" size={16} color={colors.card} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.addButton,
            (isAddingToCart || isVendorClosed) && { opacity: 0.5 },
          ]}
          onPress={handleAddToCart}
          disabled={isAddingToCart || isVendorClosed}
        >
          {isAddingToCart ? (
            <>
              <LoadingPlaceholder width={16} height={16} borderRadius={8} />
              <Text style={[styles.addButtonText, { marginLeft: spacing.xs }]}>
                Adding...
              </Text>
            </>
          ) : isVendorClosed ? (
            <>
              <Ionicons name="lock-closed" size={20} color={colors.card} />
              <Text style={styles.addButtonText}>Vendor Closed</Text>
            </>
          ) : (
            <>
              <Ionicons name="options-outline" size={20} color={colors.card} />
              <Text style={styles.addButtonText}>
                {quantity > 0
                  ? "Add More"
                  : hasCustomizationChoices
                    ? "Choose & Add"
                    : "Add to Cart"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={customizationVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomizationVisible(false)}
      >
        <View style={styles.customizationOverlay}>
          <View style={styles.customizationCard}>
            <View style={styles.customizationHeader}>
              <Text style={styles.customizationTitle}>Customize Meal</Text>
              <TouchableOpacity onPress={() => setCustomizationVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.customizationBody}
              showsVerticalScrollIndicator={false}
            >
              {mealSizeOptions.length > 0 && (
                <>
                  <Text style={styles.customizationSectionTitle}>
                    Choose Size
                  </Text>
                  <View style={styles.optionChipWrap}>
                    {mealSizeOptions.map((sizeOption) => {
                      const active = selectedSize === sizeOption;

                      return (
                        <TouchableOpacity
                          key={`modal-size-${sizeOption}`}
                          style={[
                            styles.optionChip,
                            active && styles.optionChipActive,
                          ]}
                          onPress={() => setSelectedSize(sizeOption)}
                        >
                          <Text
                            style={[
                              styles.optionChipText,
                              active && styles.optionChipTextActive,
                            ]}
                          >
                            {formatSizeLabel(sizeOption)}
                            {(() => {
                              const sizePrice = getMealPricingDetails(
                                meal,
                                sizeOption,
                                [],
                              ).sizeAdjustment;
                              return sizePrice > 0
                                ? ` (+GH₵${sizePrice.toFixed(2)})`
                                : "";
                            })()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.customizationSectionTitle}>
                Choose Specifications
              </Text>
              {mealSpecifications.length > 0 ? (
                <View style={styles.optionChipWrap}>
                  {mealSpecifications.map((spec, index) => {
                    const selected = selectedSpecifications.includes(spec);

                    return (
                      <TouchableOpacity
                        key={`modal-spec-${index}`}
                        style={[
                          styles.optionChip,
                          selected && styles.optionChipActive,
                        ]}
                        onPress={() => toggleSpecificationSelection(spec)}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected && styles.optionChipTextActive,
                          ]}
                        >
                          {spec}
                          {(() => {
                            const specificationPrice = getMealPricingDetails(
                              meal,
                              null,
                              [spec],
                            ).specificationAdjustment;
                            return specificationPrice > 0
                              ? ` (+GH₵${specificationPrice.toFixed(2)})`
                              : "";
                          })()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.optionHintText}>
                  No extra specifications available for this meal.
                </Text>
              )}
            </ScrollView>

            <View style={styles.customizationActions}>
              <TouchableOpacity
                style={[
                  styles.customizationActionButton,
                  styles.customizationCancelButton,
                ]}
                onPress={() => setCustomizationVisible(false)}
                disabled={isAddingToCart}
              >
                <Text style={styles.customizationCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.customizationActionButton,
                  styles.customizationAddButton,
                  (isAddingToCart || isVendorClosed) && { opacity: 0.5 },
                ]}
                onPress={handleConfirmAddToCart}
                disabled={isAddingToCart || isVendorClosed}
              >
                {isAddingToCart ? (
                  <LoadingPlaceholder width={16} height={16} borderRadius={8} />
                ) : (
                  <Text style={styles.customizationAddButtonText}>
                    Add
                    {selectedSize ? ` ${formatSizeLabel(selectedSize)}` : ""} to
                    Cart • GH₵{pricingDetails.unitPrice.toFixed(2)}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={fullscreenVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenVisible(false)}
      >
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreenVisible(false)}
          >
            <Ionicons name="close" size={24} color={colors.card} />
          </TouchableOpacity>

          <FlatList
            data={mealImages}
            horizontal
            pagingEnabled
            initialScrollIndex={fullscreenIndex}
            getItemLayout={(_, index) => ({
              length: responsive.width,
              offset: responsive.width * index,
              index,
            })}
            onScrollToIndexFailed={() => {}}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `full-${item}-${index}`}
            onMomentumScrollEnd={(event) =>
              handleImageMomentumScroll(event, setFullscreenIndex)
            }
            renderItem={({ item }) => (
              <View style={styles.fullscreenImagePage}>
                <Image
                  source={{ uri: item }}
                  style={styles.fullscreenImage}
                  resizeMode="contain"
                />
              </View>
            )}
          />

          {mealImages.length > 1 && (
            <View style={styles.fullscreenDots}>
              {mealImages.map((_, index) => (
                <View
                  key={`full-dot-${index}`}
                  style={[
                    styles.imageDot,
                    index === fullscreenIndex && styles.imageDotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => {
  const staticColors = colors;
  return StyleSheet.create({
    container: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: staticColors.background,
      zIndex: 5000,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: 120, // Space for bottom bar
    },
    fixedHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: spacing.xl + 20,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: staticColors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    shareButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: staticColors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    heroContainer: {
      height: responsive.isSmallDevice
        ? 280
        : responsive.isMediumDevice
          ? 320
          : 350,
      position: "relative",
      marginTop: 0,
    },
    heroImage: {
      width: responsive.width,
      height: "100%",
    },
    imageDots: {
      position: "absolute",
      bottom: spacing.md,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xs,
      zIndex: 3,
    },
    imageDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "rgba(255, 255, 255, 0.4)",
    },
    imageDotActive: {
      width: 18,
      borderRadius: 6,
      backgroundColor: staticColors.card,
    },
    closedOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1,
    },
    closedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: staticColors.error,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
    },
    closedText: {
      color: staticColors.card,
      fontSize: 16,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    heroGradient: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 100,
      justifyContent: "flex-end",
    },
    heroContent: {
      padding: spacing.lg,
    },
    categoryBadge: {
      backgroundColor: staticColors.overlay,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      alignSelf: "flex-start",
    },
    categoryText: {
      color: staticColors.textPrimary,
      fontSize: 12,
      fontWeight: "600",
    },
    mainContent: {
      padding: spacing.lg,
      gap: spacing.xl,
    },
    titleSection: {
      gap: spacing.sm,
    },
    title: {
      ...typography.headline,
      color: staticColors.textPrimary,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    metaText: {
      color: staticColors.textSecondary,
      fontSize: 14,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: staticColors.textMuted,
      marginHorizontal: spacing.xs,
    },
    sectionTitle: {
      ...typography.title,
      color: staticColors.textPrimary,
      fontSize: 18,
    },
    vendorSection: {
      gap: spacing.md,
    },
    vendorCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: staticColors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      gap: spacing.md,
    },
    vendorImage: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
    },
    vendorInfo: {
      flex: 1,
      gap: spacing.xs,
    },
    vendorName: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    vendorMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    vendorRating: {
      color: staticColors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    vendorMetaText: {
      color: staticColors.textSecondary,
      fontSize: 14,
    },
    vendorButton: {
      width: 36,
      height: 36,
      borderRadius: radii.sm,
      backgroundColor: staticColors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    descriptionSection: {
      gap: spacing.md,
    },
    description: {
      color: staticColors.textSecondary,
      lineHeight: 20,
    },
    optionChipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    optionChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: staticColors.border,
      backgroundColor: staticColors.surface,
    },
    optionChipActive: {
      borderColor: staticColors.primary,
      backgroundColor: staticColors.primary + "22",
    },
    optionChipText: {
      color: staticColors.textSecondary,
      fontSize: 13,
      fontWeight: "600",
    },
    optionChipTextActive: {
      color: staticColors.primary,
    },
    optionHintText: {
      color: staticColors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    specificationsList: {
      gap: spacing.sm,
    },
    specificationItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: staticColors.border,
      borderRadius: radii.md,
      backgroundColor: staticColors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    specificationItemActive: {
      borderColor: staticColors.success,
      backgroundColor: staticColors.success + "1A",
    },
    specificationText: {
      color: staticColors.textSecondary,
      flex: 1,
      lineHeight: 20,
    },
    specificationTextActive: {
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    ingredientsSection: {
      gap: spacing.md,
    },
    ingredientsList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    ingredientTag: {
      backgroundColor: staticColors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    ingredientText: {
      color: staticColors.textSecondary,
      fontSize: 14,
    },
    nutritionSection: {
      gap: spacing.md,
    },
    nutritionGrid: {
      flexDirection: "row",
      gap: spacing.md,
    },
    nutritionItem: {
      flex: 1,
      backgroundColor: staticColors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      alignItems: "center",
      gap: spacing.xs,
    },
    nutritionValue: {
      ...typography.title,
      color: staticColors.textPrimary,
      fontSize: 16,
    },
    nutritionLabel: {
      color: staticColors.textSecondary,
      fontSize: 12,
    },
    bottomBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: staticColors.card,
      borderTopWidth: 1,
      borderTopColor: staticColors.border,
      padding: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    priceSection: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    price: {
      ...typography.headline,
      color: staticColors.textPrimary,
      fontSize: 24,
    },
    priceMetaText: {
      color: staticColors.textSecondary,
      fontSize: 12,
      marginTop: spacing.xs,
    },
    quantityControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    quantityButton: {
      width: 28,
      height: 28,
      borderRadius: radii.sm,
      backgroundColor: staticColors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    quantityText: {
      color: staticColors.textPrimary,
      fontSize: 16,
      fontWeight: "600",
      minWidth: 24,
      textAlign: "center",
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: staticColors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.pill,
    },
    updateButton: {
      backgroundColor: staticColors.success,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      minWidth: 44,
      width: 44,
      height: 44,
      borderRadius: radii.full,
    },
    addButtonText: {
      color: staticColors.card,
      fontWeight: "700",
      fontSize: 16,
    },
    reviewsSection: {
      padding: spacing.lg,
      paddingTop: 0,
    },
    customizationOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    customizationCard: {
      backgroundColor: staticColors.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      maxHeight: "80%",
    },
    customizationHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    customizationTitle: {
      ...typography.title,
      color: staticColors.textPrimary,
    },
    customizationBody: {
      maxHeight: 360,
    },
    customizationSectionTitle: {
      color: staticColors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    customizationActions: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    customizationActionButton: {
      flex: 1,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    customizationCancelButton: {
      backgroundColor: staticColors.card,
      borderWidth: 1,
      borderColor: staticColors.border,
    },
    customizationCancelText: {
      color: staticColors.textPrimary,
      fontSize: 15,
      fontWeight: "600",
    },
    customizationAddButton: {
      backgroundColor: staticColors.primary,
    },
    customizationAddButtonText: {
      color: staticColors.card,
      fontSize: 15,
      fontWeight: "700",
    },
    fullscreenOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.95)",
      justifyContent: "center",
    },
    fullscreenClose: {
      position: "absolute",
      top: spacing.xl + 20,
      right: spacing.lg,
      zIndex: 10,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    fullscreenImagePage: {
      width: responsive.width,
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    },
    fullscreenImage: {
      width: "100%",
      height: "78%",
    },
    fullscreenDots: {
      position: "absolute",
      bottom: spacing.xl,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xs,
    },
  });
};
