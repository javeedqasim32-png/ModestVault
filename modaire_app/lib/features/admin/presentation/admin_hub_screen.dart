import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../shared/widgets/modaire_app_bar.dart';

/// Top-level admin landing. Three tiles, one per admin surface:
///   /account/admin/listings  — moderation queue
///   /account/admin/featured  — featured rail manager
///   /account/admin/orders    — order management + refunds
class AdminHubScreen extends ConsumerWidget {
  const AdminHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: const ModaireAppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        children: [
          Text(
            'Marketplace control',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 26,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF2F2925),
            ),
          ),
          const SizedBox(height: 16),
          _AdminTile(
            icon: LucideIcons.shieldCheck,
            title: 'Listings moderation',
            subtitle: 'Approve, partial-approve, reject, feature',
            onTap: () => context.push('/account/admin/listings'),
          ),
          const SizedBox(height: 12),
          _AdminTile(
            icon: LucideIcons.star,
            title: 'Featured rail',
            subtitle: 'Reorder the curated New In rail',
            onTap: () => context.push('/account/admin/featured'),
          ),
          const SizedBox(height: 12),
          _AdminTile(
            icon: LucideIcons.shoppingBag,
            title: 'Orders',
            subtitle: 'Update shipping, issue refunds',
            onTap: () => context.push('/account/admin/orders'),
          ),
        ],
      ),
    );
  }
}

class _AdminTile extends StatelessWidget {
  const _AdminTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFBF8F5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: Color(0xFFE3D9D1)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFFEDE2D5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: const Color(0xFF7A5A45), size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                LucideIcons.chevronRight,
                color: Color(0xFF8F6E59),
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
