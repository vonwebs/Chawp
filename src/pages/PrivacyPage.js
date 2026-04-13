import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing, radii, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

export default function PrivacyPage({ onClose }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        {/* Fixed Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Privacy & Terms</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Privacy Policy */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy Policy</Text>
            <Text style={styles.lastUpdated}>Last updated: November 2025</Text>

            <Text style={styles.paragraph}>
              At Chawp, we take your privacy seriously. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your
              information when you use our food delivery application.
            </Text>

            <Text style={styles.subheading}>1. Information We Collect</Text>
            <Text style={styles.paragraph}>
              We collect information that you provide directly to us, including:
            </Text>
            <Text style={styles.bulletPoint}>
              • Personal information (name, email, phone number)
            </Text>
            <Text style={styles.bulletPoint}>
              • Delivery addresses and location data
            </Text>
            <Text style={styles.bulletPoint}>
              • Payment information (processed securely through Paystack)
            </Text>
            <Text style={styles.bulletPoint}>
              • Order history and preferences
            </Text>
            <Text style={styles.bulletPoint}>
              • Device information and app usage data
            </Text>

            <Text style={styles.subheading}>
              2. How We Use Your Information
            </Text>
            <Text style={styles.paragraph}>We use your information to:</Text>
            <Text style={styles.bulletPoint}>
              • Process and deliver your food orders
            </Text>
            <Text style={styles.bulletPoint}>
              • Communicate with you about your orders and account
            </Text>
            <Text style={styles.bulletPoint}>
              • Improve our services and user experience
            </Text>
            <Text style={styles.bulletPoint}>
              • Send you promotional offers (with your consent)
            </Text>
            <Text style={styles.bulletPoint}>
              • Ensure the security of our platform
            </Text>

            <Text style={styles.subheading}>3. Data Sharing</Text>
            <Text style={styles.paragraph}>
              We do not sell your personal information. We may share your data
              with:
            </Text>
            <Text style={styles.bulletPoint}>
              • Restaurant partners to fulfill your orders
            </Text>
            <Text style={styles.bulletPoint}>
              • Delivery personnel to complete deliveries
            </Text>
            <Text style={styles.bulletPoint}>
              • Payment processors (Paystack) for transactions
            </Text>
            <Text style={styles.bulletPoint}>
              • Service providers who help us operate the app
            </Text>

            <Text style={styles.subheading}>4. Data Security</Text>
            <Text style={styles.paragraph}>
              We implement industry-standard security measures to protect your
              information. However, no method of transmission over the internet
              is 100% secure, and we cannot guarantee absolute security.
            </Text>

            <Text style={styles.subheading}>5. Your Rights</Text>
            <Text style={styles.paragraph}>You have the right to:</Text>
            <Text style={styles.bulletPoint}>
              • Access and update your personal information
            </Text>
            <Text style={styles.bulletPoint}>
              • Delete your account and associated data
            </Text>
            <Text style={styles.bulletPoint}>
              • Opt-out of marketing communications
            </Text>
            <Text style={styles.bulletPoint}>
              • Request a copy of your data
            </Text>
          </View>

          {/* Terms and Conditions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms and Conditions</Text>
            <Text style={styles.lastUpdated}>Last updated: November 2025</Text>

            <Text style={styles.subheading}>1. Acceptance of Terms</Text>
            <Text style={styles.paragraph}>
              By accessing and using Chawp, you accept and agree to be bound by
              these Terms and Conditions. If you do not agree, please do not use
              our services.
            </Text>

            <Text style={styles.subheading}>2. User Accounts</Text>
            <Text style={styles.paragraph}>
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activities under your account. You
              must be at least 18 years old to create an account.
            </Text>

            <Text style={styles.subheading}>3. Orders and Payments</Text>
            <Text style={styles.bulletPoint}>
              • All prices are in Ghanaian Cedis (GH₵)
            </Text>
            <Text style={styles.bulletPoint}>
              • Payment must be completed before order processing
            </Text>
            <Text style={styles.bulletPoint}>
              • Service and delivery fees apply to all orders
            </Text>
            <Text style={styles.bulletPoint}>
              • Orders are subject to restaurant availability
            </Text>

            <Text style={styles.subheading}>4. Cancellations and Refunds</Text>
            <Text style={styles.paragraph}>
              Orders cannot be cancelled once they have been accepted by the
              restaurant. Refunds are processed on a case-by-case basis for
              valid reasons such as incorrect orders or quality issues.
            </Text>

            <Text style={styles.subheading}>5. Delivery</Text>
            <Text style={styles.paragraph}>
              Delivery times are estimates and may vary due to factors beyond
              our control. We are not liable for delays caused by weather,
              traffic, or other unforeseen circumstances.
            </Text>

            <Text style={styles.subheading}>6. User Conduct</Text>
            <Text style={styles.paragraph}>You agree not to:</Text>
            <Text style={styles.bulletPoint}>
              • Misuse or abuse the platform or services
            </Text>
            <Text style={styles.bulletPoint}>
              • Provide false or misleading information
            </Text>
            <Text style={styles.bulletPoint}>
              • Violate any applicable laws or regulations
            </Text>
            <Text style={styles.bulletPoint}>
              • Interfere with other users' use of the service
            </Text>

            <Text style={styles.subheading}>7. Intellectual Property</Text>
            <Text style={styles.paragraph}>
              All content, trademarks, and intellectual property on Chawp are
              owned by us or our licensors. You may not copy, modify, or
              distribute any content without permission.
            </Text>

            <Text style={styles.subheading}>8. Limitation of Liability</Text>
            <Text style={styles.paragraph}>
              Chawp is not liable for any indirect, incidental, or consequential
              damages arising from your use of our services. Our liability is
              limited to the amount you paid for the specific order in question.
            </Text>

            <Text style={styles.subheading}>9. Changes to Terms</Text>
            <Text style={styles.paragraph}>
              We reserve the right to modify these terms at any time. Continued
              use of our services constitutes acceptance of updated terms.
            </Text>

            <Text style={styles.subheading}>10. Contact Us</Text>
            <Text style={styles.paragraph}>
              For questions about these terms or our privacy practices, please
              contact us:
            </Text>
            <Text style={styles.bulletPoint}>• Email: support@chawp.com</Text>
            <Text style={styles.bulletPoint}>• WhatsApp: +233509330098</Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By using Chawp, you acknowledge that you have read and understood
              these terms and our privacy policy.
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      zIndex: 2000,
      justifyContent: "center",
      alignItems: "center",
    },
    container: {
      width: "100%",
      height: "100%",
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.md,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      ...typography.headline,
      color: colors.textPrimary,
      fontSize: 18,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    section: {
      marginBottom: spacing.xl * 2,
    },
    sectionTitle: {
      ...typography.display,
      color: colors.textPrimary,
      fontSize: 24,
      marginBottom: spacing.xs,
    },
    lastUpdated: {
      color: colors.textMuted,
      fontSize: 12,
      marginBottom: spacing.lg,
      fontStyle: "italic",
    },
    subheading: {
      ...typography.headline,
      color: colors.textPrimary,
      fontSize: 16,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    paragraph: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    bulletPoint: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 24,
      marginLeft: spacing.md,
    },
    footer: {
      marginTop: spacing.xl,
      padding: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    footerText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      fontStyle: "italic",
    },
  });
