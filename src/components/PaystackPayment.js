import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Paystack } from "react-native-paystack-webview";

/**
 * In-App Paystack Payment Component
 * @param {string} paystackKey - Paystack public key
 * @param {string} email - Customer email
 * @param {number} amount - Amount in cedis (will be converted to pesewas)
 * @param {string} reference - Unique payment reference
 * @param {function} onSuccess - Callback when payment succeeds
 * @param {function} onCancel - Callback when payment is cancelled
 * @param {object} metadata - Additional metadata
 * @param {React.ReactNode} buttonComponent - Custom button to trigger payment
 */
export default function PaystackPayment({
  paystackKey,
  email,
  amount,
  reference,
  onSuccess,
  onCancel,
  metadata = {},
  buttonComponent,
}) {
  const paystackWebViewRef = useRef();

  // Convert amount to pesewas (Paystack uses lowest currency unit)
  const amountInPesewas = Math.round(amount * 100);

  return (
    <View style={styles.container}>
      {/* Custom button that triggers the payment */}
      {buttonComponent}

      {/* Paystack WebView - hidden until triggered */}
      <Paystack
        paystackKey={paystackKey}
        billingEmail={email}
        amount={amountInPesewas}
        currency="GHS"
        channels={["card", "bank", "ussd", "qr", "mobile_money"]}
        refNumber={reference}
        billingName={metadata.customerName || "Customer"}
        billingMobile={metadata.phone || ""}
        metadata={{
          ...metadata,
          custom_fields: [
            {
              display_name: "Order Type",
              variable_name: "order_type",
              value: metadata.orderType || "food_delivery",
            },
          ],
        }}
        onCancel={(e) => {
          console.log("Payment cancelled:", e);
          if (onCancel) onCancel(e);
        }}
        onSuccess={(res) => {
          console.log("Payment successful:", res);
          if (onSuccess) onSuccess(res);
        }}
        ref={paystackWebViewRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
});
