import 'package:flutter/widgets.dart';

class ForegroundRefreshObserver with WidgetsBindingObserver {
  ForegroundRefreshObserver({required this.onResumed});

  final VoidCallback onResumed;
  bool _attached = false;

  void attach() {
    if (_attached) return;
    WidgetsBinding.instance.addObserver(this);
    _attached = true;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_attached && state == AppLifecycleState.resumed) onResumed();
  }

  void dispose() {
    if (!_attached) return;
    WidgetsBinding.instance.removeObserver(this);
    _attached = false;
  }
}
