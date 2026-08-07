import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/auth_controller.dart';
import '../features/auth/presentation/delete_account_screen.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/sign_in_screen.dart';
import '../features/auth/presentation/sign_up_details_screen.dart';
import '../features/auth/presentation/sign_up_verify_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/legal/presentation/privacy_policy_screen.dart';
import '../features/legal/presentation/terms_of_service_screen.dart';
import '../features/browse/presentation/explore_screen.dart';
import '../features/browse/presentation/home_screen.dart';
import '../features/browse/presentation/listing_detail_screen.dart';
import '../features/browse/presentation/search_screen.dart';
import '../features/cart/presentation/cart_screen.dart';
import '../features/checkout/presentation/checkout_screen.dart';
import '../features/favorites/presentation/favorites_screen.dart';
import '../features/messages/presentation/message_thread_screen.dart';
import '../features/messages/presentation/messages_inbox_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/orders/presentation/order_detail_screen.dart';
import '../features/sellers/presentation/seller_profile_screen.dart';
import '../features/orders/presentation/orders_placeholder_screen.dart';
import '../features/admin/presentation/admin_featured_screen.dart';
import '../features/admin/presentation/admin_hub_screen.dart';
import '../features/admin/presentation/admin_listing_images_screen.dart';
import '../features/admin/presentation/admin_listings_screen.dart';
import '../features/admin/presentation/admin_orders_screen.dart';
import '../features/profile/presentation/account_screen.dart';
import '../features/profile/presentation/settings_screen.dart';
import '../features/sell/presentation/connect_setup_screen.dart';
import '../features/sell/presentation/create_listing_screen.dart';
import '../features/sell/presentation/earnings_screen.dart';
import '../features/sell/presentation/edit_listing_screen.dart';
import '../features/sell/presentation/sell_placeholder_screen.dart';
import '../features/sell/presentation/seller_listing_photos_screen.dart';
import '../shared/widgets/main_shell.dart';

class _AuthRefreshListenable extends ChangeNotifier {
  _AuthRefreshListenable(Ref ref) {
    ref.listen<AuthState>(authControllerProvider, (_, __) => notifyListeners());
  }
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _homeNavKey = GlobalKey<NavigatorState>();
final _exploreNavKey = GlobalKey<NavigatorState>();
final _sellNavKey = GlobalKey<NavigatorState>();
final _ordersNavKey = GlobalKey<NavigatorState>();
final _accountNavKey = GlobalKey<NavigatorState>();

final goRouterProvider = Provider<GoRouter>((ref) {
  final refreshListenable = _AuthRefreshListenable(ref);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    debugLogDiagnostics: false,
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      // Auth-surface routes: accessible only when unauthenticated. A
      // signed-in user landing on any of these gets punted to the home
      // tab so a completed session doesn't dead-end on the auth surface.
      // NOTE: /splash is intentionally NOT in this set — it belongs to
      // the AuthInitial phase only.
      const authRoutes = {
        '/sign-in',
        '/signup',
        '/signup/verify',
        '/forgot-password',
      };
      // Public-always routes: readable in any auth state (splash, signed
      // in, signed out). Apple review needs to reach privacy + terms
      // from anywhere without having to sign up first.
      const publicAlwaysRoutes = {
        '/legal/privacy',
        '/legal/terms',
      };

      if (auth is AuthInitial) {
        return loc == '/splash' ? null : '/splash';
      }
      if (publicAlwaysRoutes.contains(loc)) return null;
      if (auth is AuthUnauthenticated) {
        return authRoutes.contains(loc) ? null : '/sign-in';
      }
      if (auth is AuthAuthenticated) {
        if (loc == '/splash' || authRoutes.contains(loc)) return '/';
        return null;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        name: 'splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/sign-in',
        name: 'sign-in',
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: '/signup',
        name: 'signup',
        builder: (context, state) => const SignUpDetailsScreen(),
      ),
      GoRoute(
        path: '/signup/verify',
        name: 'signup-verify',
        builder: (context, state) => SignUpVerifyScreen(
          email: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/forgot-password',
        name: 'forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      // Legal routes are top-level + accessible in any auth state so App
      // Store reviewers (and sign-up-flow users who haven't accepted yet)
      // can read the policies without needing an account first.
      GoRoute(
        path: '/legal/privacy',
        name: 'legal-privacy',
        builder: (context, state) => const PrivacyPolicyScreen(),
      ),
      GoRoute(
        path: '/legal/terms',
        name: 'legal-terms',
        builder: (context, state) => const TermsOfServiceScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navShell) =>
            MainShell(navigationShell: navShell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _homeNavKey,
            routes: [
              GoRoute(
                path: '/',
                name: 'home',
                builder: (context, state) => const HomeScreen(),
                routes: [
                  GoRoute(
                    path: 'listings/:id',
                    name: 'home-listing-detail',
                    builder: (context, state) => ListingDetailScreen(
                      listingId: state.pathParameters['id']!,
                    ),
                  ),
                  GoRoute(
                    path: 'cart',
                    name: 'cart',
                    builder: (context, state) => const CartScreen(),
                  ),
                  GoRoute(
                    path: 'checkout',
                    name: 'checkout',
                    builder: (context, state) => CheckoutScreen(
                      itemsCsv: state.uri.queryParameters['items'],
                    ),
                  ),
                  // These three stay INSIDE the home branch. Hoisting them to
                  // the root navigator looks tempting — they're linked from
                  // ModaireAppBar, which appears on screens in every branch —
                  // but it breaks anything they push onward. A root-level
                  // seller profile pushing '/listings/:id' forces GoRouter to
                  // rebuild the shell page that is already sitting under it on
                  // the root navigator, and the duplicate page key trips
                  // `!keyReservation.contains(key)` in navigator.dart.
                  GoRoute(
                    path: 'notifications',
                    name: 'notifications',
                    builder: (context, state) => const NotificationsScreen(),
                  ),
                  GoRoute(
                    path: 'messages',
                    name: 'messages',
                    builder: (context, state) => const MessagesInboxScreen(),
                    routes: [
                      GoRoute(
                        path: ':id',
                        name: 'message-thread',
                        builder: (context, state) => MessageThreadScreen(
                          conversationId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'sellers/:id',
                    name: 'seller-profile',
                    builder: (context, state) => SellerProfileScreen(
                      sellerId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _exploreNavKey,
            routes: [
              GoRoute(
                path: '/browse',
                name: 'explore',
                builder: (context, state) => const ExploreScreen(),
                routes: [
                  GoRoute(
                    path: 'listings/:id',
                    name: 'explore-listing-detail',
                    builder: (context, state) => ListingDetailScreen(
                      listingId: state.pathParameters['id']!,
                    ),
                  ),
                  GoRoute(
                    path: 'search',
                    name: 'search',
                    builder: (context, state) => const SearchScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _sellNavKey,
            routes: [
              GoRoute(
                path: '/sell',
                name: 'sell',
                builder: (context, state) => SellPlaceholderScreen(
                  initialTab: state.uri.queryParameters['tab'],
                ),
                routes: [
                  GoRoute(
                    path: 'create',
                    name: 'sell-create',
                    builder: (context, state) => CreateListingScreen(
                      resumeDraftId: state.uri.queryParameters['draftId'],
                    ),
                  ),
                  GoRoute(
                    path: 'edit/:id',
                    name: 'sell-edit',
                    builder: (context, state) => EditListingScreen(
                      listingId: state.pathParameters['id']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'photos',
                        name: 'sell-edit-photos',
                        builder: (context, state) =>
                            SellerListingPhotosScreen(
                          listingId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _ordersNavKey,
            routes: [
              GoRoute(
                path: '/orders',
                name: 'orders',
                builder: (context, state) => const OrdersPlaceholderScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    name: 'order-detail',
                    builder: (context, state) => OrderDetailScreen(
                      orderId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _accountNavKey,
            routes: [
              GoRoute(
                path: '/account',
                name: 'account',
                builder: (context, state) => const AccountScreen(),
                routes: [
                  GoRoute(
                    path: 'favorites',
                    name: 'favorites',
                    builder: (context, state) => const FavoritesScreen(),
                    routes: [
                      GoRoute(
                        path: 'listings/:id',
                        name: 'favorites-listing-detail',
                        builder: (context, state) => ListingDetailScreen(
                          listingId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'settings',
                    name: 'settings',
                    builder: (context, state) => const SettingsScreen(),
                  ),
                  GoRoute(
                    path: 'delete',
                    name: 'account-delete',
                    builder: (context, state) => const DeleteAccountScreen(),
                  ),
                  GoRoute(
                    path: 'payouts',
                    name: 'account-payouts',
                    builder: (context, state) => const ConnectSetupScreen(),
                  ),
                  GoRoute(
                    path: 'earnings',
                    name: 'account-earnings',
                    builder: (context, state) => const EarningsScreen(),
                  ),
                  GoRoute(
                    path: 'admin',
                    name: 'admin-hub',
                    builder: (context, state) => const AdminHubScreen(),
                    routes: [
                      GoRoute(
                        path: 'listings',
                        name: 'admin-listings',
                        builder: (context, state) =>
                            const AdminListingsScreen(),
                        routes: [
                          GoRoute(
                            path: ':id/images',
                            name: 'admin-listing-images',
                            builder: (context, state) =>
                                AdminListingImagesScreen(
                              listingId: state.pathParameters['id']!,
                            ),
                          ),
                        ],
                      ),
                      GoRoute(
                        path: 'featured',
                        name: 'admin-featured',
                        builder: (context, state) =>
                            const AdminFeaturedScreen(),
                      ),
                      GoRoute(
                        path: 'orders',
                        name: 'admin-orders',
                        builder: (context, state) =>
                            const AdminOrdersScreen(),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
