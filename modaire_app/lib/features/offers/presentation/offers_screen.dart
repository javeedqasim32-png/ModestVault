import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/offers/offer_models.dart';
import '../../../core/offers/offer_repository.dart';

final _offersProvider = FutureProvider.family<List<OfferSummary>, bool>((ref, selling) {
  return ref.read(offerRepositoryProvider).list(selling: selling);
});

String _statusLabel(String s) => const {
      'PENDING': 'Pending',
      'COUNTERED': 'Countered',
      'ACCEPTED': 'Accepted',
      'REJECTED': 'Declined',
      'EXPIRED': 'Expired',
      'WITHDRAWN': 'Withdrawn',
      'COMPLETED': 'Purchased',
    }[s] ?? s;

class OffersScreen extends StatelessWidget {
  const OffersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: ModaireColors.browsePageBg,
        appBar: AppBar(
          backgroundColor: ModaireColors.browsePageBg,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          title: Text('Offers', style: GoogleFonts.jost(fontWeight: FontWeight.w600, color: ModaireColors.espressoText)),
          bottom: TabBar(
            labelColor: ModaireColors.espresso,
            unselectedLabelColor: ModaireColors.tileTextSubtle,
            indicatorColor: ModaireColors.espresso,
            labelStyle: GoogleFonts.jost(fontWeight: FontWeight.w600),
            tabs: const [Tab(text: 'Buying'), Tab(text: 'Selling')],
          ),
        ),
        body: const TabBarView(children: [_OffersList(selling: false), _OffersList(selling: true)]),
      ),
    );
  }
}

class _OffersList extends ConsumerWidget {
  const _OffersList({required this.selling});
  final bool selling;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_offersProvider(selling));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: ModaireColors.espresso, strokeWidth: 2)),
      error: (e, _) => Center(child: Text('Couldn\'t load offers', style: GoogleFonts.jost(color: ModaireColors.tileTextSubtle))),
      data: (offers) {
        if (offers.isEmpty) {
          return Center(
            child: Text(selling ? 'No offers on your listings yet.' : 'You haven\'t made any offers yet.',
                style: GoogleFonts.jost(color: ModaireColors.tileTextSubtle)),
          );
        }
        return RefreshIndicator(
          color: ModaireColors.espresso,
          onRefresh: () async => ref.refresh(_offersProvider(selling).future),
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: offers.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _OfferTile(offer: offers[i], selling: selling),
          ),
        );
      },
    );
  }
}

class _OfferTile extends StatelessWidget {
  const _OfferTile({required this.offer, required this.selling});
  final OfferSummary offer;
  final bool selling;

  @override
  Widget build(BuildContext context) {
    final yourTurn = offer.isActive && offer.currentTurn == (selling ? 'SELLER' : 'BUYER');
    return InkWell(
      onTap: () => context.push('/offers/${offer.id}'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: ModaireColors.tileBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ModaireColors.tileBorder),
        ),
        child: Row(
          children: [
            if (offer.listing.imageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: CachedNetworkImage(imageUrl: offer.listing.imageUrl!, width: 52, height: 52, fit: BoxFit.cover),
              ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer.listing.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.jost(fontWeight: FontWeight.w500, color: ModaireColors.espressoText)),
                  const SizedBox(height: 2),
                  Text(
                    '\$${offer.currentAmount?.toStringAsFixed(2)} · ${_statusLabel(offer.status)}'
                    '${selling && offer.buyerName != null ? ' · ${offer.buyerName}' : ''}',
                    style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.tileTextSubtle),
                  ),
                ],
              ),
            ),
            if (yourTurn)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: ModaireColors.espresso, borderRadius: BorderRadius.circular(99)),
                child: Text('Your turn', style: GoogleFonts.jost(fontSize: 10, fontWeight: FontWeight.w600, color: ModaireColors.cream)),
              ),
          ],
        ),
      ),
    );
  }
}
