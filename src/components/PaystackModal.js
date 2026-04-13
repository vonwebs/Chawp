import React, { useMemo, useState } from "react";
import { View, Modal, TouchableOpacity, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radii, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import LoadingPlaceholder from "./LoadingPlaceholder";

/**
 * In-App Paystack Payment Modal using WebView
 */
export default function PaystackModal({
  visible,
  paystackKey,
  email,
  amount,
  reference,
  accessCode,
  onSuccess,
  onCancel,
  metadata = {},
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isLoading, setIsLoading] = useState(true);

  // Convert amount to pesewas
  const amountInPesewas = Math.round(amount * 100);

  // Generate Paystack inline payment HTML
  const paystackHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://js.paystack.co/v1/inline.js"></script>
        <style>
          body {
            margin: 0;
            padding: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0A0E1A;
            color: #E5E7EB;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .container {
            text-align: center;
            max-width: 400px;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .logo {
            font-size: 48px;
            font-weight: bold;
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
          }
          .amount {
            font-size: 36px;
            font-weight: bold;
            color: #8B5CF6;
            margin: 20px 0;
          }
          .email {
            color: #9CA3AF;
            margin-bottom: 30px;
          }
          .btn {
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            color: white;
            border: none;
            padding: 16px 32px;
            font-size: 18px;
            font-weight: bold;
            border-radius: 30px;
            cursor: pointer;
            width: 100%;
            margin-top: 10px;
          }
          .btn:active {
            opacity: 0.8;
          }
          .info {
            margin-top: 20px;
            color: #9CA3AF;
            font-size: 14px;
          }
          .payment-methods {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 15px;
            flex-wrap: wrap;
          }
          .method {
            background: rgba(139, 92, 246, 0.1);
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 12px;
            color: #8B5CF6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">CHAWP</div>
          <div class="amount">GH₵${amount.toFixed(2)}</div>
          <div class="email">${email}</div>
          <button class="btn" onclick="payWithPaystack()">Pay Now</button>
          <div class="payment-methods">
            <span class="method">💳 Card</span>
            <span class="method">🏦 Bank</span>
            <span class="method">📱 Mobile Money</span>
          </div>
          <div class="info">Secure payment powered by Paystack</div>
        </div>
        
        <script>
          function payWithPaystack() {
            var config = {
              key: '${paystackKey}',
              email: '${email}',
              amount: ${amountInPesewas},
              currency: 'GHS',
              ref: '${reference}',
              channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money'],
              metadata: ${JSON.stringify(metadata)},
              onClose: function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  event: 'cancel'
                }));
              },
              callback: function(response) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  event: 'success',
                  data: response
                }));
              }
            };

            ${accessCode ? `config.access_code = '${accessCode}';` : ""}

            var handler = PaystackPop.setup(config);
            handler.openIframe();
          }
          
          // Auto-trigger payment on load
          setTimeout(function() {
            payWithPaystack();
          }, 500);
        </script>
      </body>
    </html>
  `;

  const handleWebViewMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.event === "success") {
        console.log("Payment successful:", message.data);
        if (onSuccess) {
          onSuccess({
            transactionRef: {
              reference: message.data.reference,
              trans: message.data.trans,
              status: message.data.status,
              message: message.data.message,
              trxref: message.data.trxref,
            },
          });
        }
      } else if (message.event === "cancel") {
        console.log("Payment cancelled");
        if (onCancel) onCancel();
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Complete Payment</Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* WebView */}
        <WebView
          source={{ html: paystackHTML }}
          onMessage={handleWebViewMessage}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={true}
          mixedContentMode="always"
        />

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <LoadingPlaceholder width={72} height={12} borderRadius={8} />
            <Text style={styles.loadingText}>Loading payment...</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      paddingTop: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    headerTitle: {
      ...typography.headline,
      color: colors.textPrimary,
    },
    closeButton: {
      padding: spacing.sm,
    },
    webView: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.7)",
      alignItems: "center",
      justifyContent: "center",
    },
    loadingText: {
      color: colors.textPrimary,
      marginTop: spacing.md,
      fontSize: 16,
    },
  });
