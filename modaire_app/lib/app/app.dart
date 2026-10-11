import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/notifications/push_service.dart';
import 'router.dart';
import 'theme.dart';

class ModaireApp extends ConsumerStatefulWidget {
  const ModaireApp({super.key});

  @override
  ConsumerState<ModaireApp> createState() => _ModaireAppState();
}

class _ModaireAppState extends ConsumerState<ModaireApp> {
  @override
  void initState() {
    super.initState();
    // Wire push listeners once the first frame is up, so the router exists
    // before a cold-start notification tap tries to navigate.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(pushServiceProvider).init();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(goRouterProvider);
    return MaterialApp.router(
      title: 'Modaire',
      debugShowCheckedModeBanner: false,
      theme: buildModaireTheme(),
      routerConfig: router,
    );
  }
}
