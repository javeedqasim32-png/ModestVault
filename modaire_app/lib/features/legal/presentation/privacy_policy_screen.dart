import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Privacy Policy shown in-app. Apple Guideline 5.1.1 requires policy text
/// be readable WITHOUT leaving the app; a link to shopmodaire.com/privacy
/// alone doesn't clear review. Body mirrors src/components/policies/
/// PrivacyBody.tsx — the same source the web renders on /privacy + inside
/// the /policies accordion. Update both surfaces together when the policy
/// changes.
class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  static const _support = 'shopmodaire@gmail.com';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ModaireColors.cream,
      appBar: const ModaireAppBar(),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Privacy Policy',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 36,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espresso,
                ),
              ),
              const SizedBox(height: 20),
              _p(
                'We collect your name, email and usage data to operate the marketplace. '
                'We never sell your data. Payment information is handled by Stripe and '
                'never stored on our servers. You may request account deletion at any time.',
              ),
              const SizedBox(height: 24),
              _divider(),
              _sectionLabel('SMS / Text Messaging'),
              _p(
                "When you opt in to SMS on Modaire's signup page, your consent is given "
                'directly to Modaire and is not shared with any third-party aggregator, '
                'affiliate, or marketing partner.',
              ),
              _p(
                'Modaire may collect your mobile phone number when you create an account, '
                'update your profile, or choose to receive text message alerts.',
              ),
              _p(
                'If you opt in, Modaire may send you SMS/text messages related to your '
                'account activity, including alerts about unread buyer/seller messages, '
                'marketplace communication, account updates, and other service-related '
                'notifications.',
              ),
              _p(
                'Message frequency may vary. Message and data rates may apply. You can '
                'opt out of SMS messages at any time by replying STOP to any message. '
                'You may also contact us at $_support for help.',
              ),
              _p(
                'Modaire does not sell, rent, or share your mobile phone number with '
                'third parties or affiliates for marketing or promotional purposes.',
              ),
              _p(
                'Text messaging originator opt-in data and consent will not be shared '
                'with any third parties, except as needed to provide SMS messaging '
                'services, comply with law, or protect the rights, safety, and security '
                'of Modaire, our users, or others.',
              ),
              _p(
                'Your decision to opt in to SMS messages is optional and is not required '
                'to use Modaire or make a purchase.',
              ),
              const SizedBox(height: 24),
              Text(
                'Questions? Contact $_support.',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: ModaireColors.tileTextSubtle,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _p(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          text,
          style: GoogleFonts.jost(
            fontSize: 15,
            height: 1.55,
            color: ModaireColors.espressoText,
          ),
        ),
      );

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          text,
          style: GoogleFonts.jost(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            letterSpacing: 2.5,
            color: const Color(0xFF6F5647),
          ),
        ),
      );

  Widget _divider() => Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Container(height: 1, color: const Color(0x33D9CFC7)),
      );
}
