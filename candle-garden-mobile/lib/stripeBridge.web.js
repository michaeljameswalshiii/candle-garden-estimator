import React, { createContext, useContext, useMemo, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const StripeWebContext = createContext(null);

export function StripeProvider({ children, publishableKey }) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)),
    [publishableKey]
  );
  return <StripeWebContext.Provider value={stripePromise}>{children}</StripeWebContext.Provider>;
}

function buttonStyle(background, color = '#fff') {
  return `border:0;border-radius:8px;padding:12px 18px;background:${background};color:${color};font:600 15px system-ui,sans-serif;cursor:pointer`;
}

/** Browser adapter for the PaymentSheet methods used by OrdersScreen. */
export function useStripe() {
  const stripePromise = useContext(StripeWebContext);
  const clientSecretRef = useRef('');

  return useMemo(() => ({
    async initPaymentSheet({ paymentIntentClientSecret }) {
      if (!paymentIntentClientSecret) {
        return { error: { message: 'Stripe did not return a payment client secret.' } };
      }
      clientSecretRef.current = paymentIntentClientSecret;
      return {};
    },

    async presentPaymentSheet() {
      const stripe = await stripePromise;
      const clientSecret = clientSecretRef.current;
      if (!stripe || !clientSecret) {
        return { error: { message: 'Stripe test checkout is not ready.' } };
      }

      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,32,28,.68);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';

        const panel = document.createElement('div');
        panel.style.cssText = 'width:min(100%,480px);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.3);box-sizing:border-box';

        const heading = document.createElement('h2');
        heading.textContent = 'Stripe test checkout';
        heading.style.cssText = 'margin:0 0 6px;color:#103831;font:600 24px Georgia,serif';
        const note = document.createElement('p');
        note.textContent = 'Test mode only — use card 4242 4242 4242 4242. No real charge will be made.';
        note.style.cssText = 'margin:0 0 20px;color:#5f6f6b;font:14px system-ui,sans-serif';
        const paymentHost = document.createElement('div');
        const errorText = document.createElement('p');
        errorText.setAttribute('aria-live', 'polite');
        errorText.style.cssText = 'min-height:20px;margin:12px 0 0;color:#b42318;font:14px system-ui,sans-serif';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:18px';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.style.cssText = buttonStyle('#eef1f0', '#103831');
        const pay = document.createElement('button');
        pay.type = 'button';
        pay.textContent = 'Pay test order';
        pay.style.cssText = buttonStyle('#103831');

        actions.append(cancel, pay);
        panel.append(heading, note, paymentHost, errorText, actions);
        overlay.append(panel);
        document.body.append(overlay);

        const elements = stripe.elements({
          clientSecret,
          appearance: { theme: 'stripe', variables: { colorPrimary: '#103831', borderRadius: '8px' } },
        });
        const paymentElement = elements.create('payment', { layout: 'tabs' });
        paymentElement.mount(paymentHost);

        let finished = false;
        const finish = (result) => {
          if (finished) return;
          finished = true;
          paymentElement.destroy();
          overlay.remove();
          resolve(result);
        };

        cancel.addEventListener('click', () => finish({ error: { code: 'Canceled' } }));
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) finish({ error: { code: 'Canceled' } });
        });
        pay.addEventListener('click', async () => {
          pay.disabled = true;
          pay.textContent = 'Processing…';
          errorText.textContent = '';
          const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
          if (result.error) {
            errorText.textContent = result.error.message || 'The test payment could not be completed.';
            pay.disabled = false;
            pay.textContent = 'Pay test order';
            return;
          }
          finish({});
        });
      });
    },
  }), [stripePromise]);
}
