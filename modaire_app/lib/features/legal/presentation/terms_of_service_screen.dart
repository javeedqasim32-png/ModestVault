import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Terms & Conditions shown in-app. Body mirrors
/// src/components/policies/TermsBody.tsx — same source the web renders on
/// /terms and inside the /policies accordion. Any policy update must
/// propagate to both surfaces together.
class TermsOfServiceScreen extends StatelessWidget {
  const TermsOfServiceScreen({super.key});

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
                'Terms & Conditions',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 36,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espresso,
                ),
              ),
              const SizedBox(height: 20),
              _p(
                'By using Modaire (shopmodaire.com), a peer-to-peer marketplace for '
                'modest fashion, you agree to these Terms. If you do not agree, do not '
                'use the service.',
              ),
              _sectionLabel('SMS Communications'),
              _p(
                'SMS/text messages are optional. Message and data rates may apply. '
                'Reply STOP to opt out, HELP for help. You must be 18 or older to opt in.',
              ),
              _p(
                "When you opt in to SMS on Modaire's signup page, your consent is given "
                'directly to Modaire and is not shared with any third-party aggregator, '
                'affiliate, or marketing partner. Modaire does not sell, rent, or share '
                'your mobile phone number or mobile opt-in data with third parties or '
                'affiliates for marketing or promotional purposes.',
              ),
              _sectionLabel('Eligibility & Account'),
              _p(
                'You must be at least 18 and legally able to enter into a binding '
                'contract. You must provide accurate registration information (name, '
                'email, address, and phone number for verification) and keep your login '
                'credentials secure. Modaire currently supports shipping within the '
                'United States.',
              ),
              _sectionLabel('Marketplace Role'),
              _p(
                'Modaire connects independent buyers and sellers. We do not take title '
                'to items listed for sale. Sellers are responsible for the accuracy, '
                'authenticity, and timely shipment of their items; buyers are '
                'responsible for reading listings and paying for what they purchase.',
              ),
              _sectionLabel('User Conduct'),
              _p(
                'You agree not to list counterfeit, stolen, or misrepresented items; '
                'circumvent our payment system; harass, threaten, or defraud other '
                'users; impersonate anyone; or attempt to access accounts or systems '
                'you are not authorized to use. Violations may result in listing '
                'removal, suspension, or permanent termination.',
              ),
              _sectionLabel('Payments'),
              _p(
                'All payments are processed by Stripe. Modaire charges a 15% commission '
                'on completed sales. Seller payouts are held briefly after delivery '
                'confirmation to allow disputes to be raised.',
              ),
              _sectionLabel('Disclaimers & Liability'),
              _p(
                'Modaire is provided "as is" without warranties of any kind. We are not '
                'responsible for the acts or omissions of buyers or sellers. To the '
                "extent permitted by law, Modaire's aggregate liability for any claim "
                'will not exceed the greater of the fees collected from you in the 90 '
                'days before the claim or \$100, and we are not liable for indirect or '
                'consequential damages.',
              ),
              _sectionLabel('Contact'),
              _p('Questions about these Terms: $_support.'),
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
        padding: const EdgeInsets.only(top: 12, bottom: 12),
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
}
