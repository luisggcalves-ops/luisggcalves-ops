/*
 * Everything that talks to Supabase lives here.
 *
 * call(name, args) runs one of the database functions from
 * supabase/schema.sql (Supabase calls this "RPC").
 *
 * live(code, onChange) makes the page update by itself: after anyone taps
 * In / Maybe / Out, their phone sends a tiny "something changed" ping on a
 * Supabase Realtime channel, and every other open phone reloads the list.
 */
(function (root) {
  'use strict';

  var cfg = root.TEAMSHEET_CONFIG || {};
  var configured = Boolean(
    cfg.supabaseUrl && cfg.supabaseKey &&
    cfg.supabaseUrl.indexOf('YOUR-PROJECT') === -1 &&
    cfg.supabaseKey.indexOf('YOUR-') === -1
  );

  var client = null;
  if (configured && root.supabase) {
    client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  function friendly(message) {
    message = message || 'Something went wrong. Please try again.';
    if (/fetch|network|load failed/i.test(message)) {
      return 'No connection. Check your internet and try again.';
    }
    return message;
  }

  async function call(fn, args) {
    if (!client) {
      throw new Error(root.supabase ? 'Teamsheet is not connected to Supabase yet.'
                                    : 'Could not load Supabase. Check your internet.');
    }
    var res;
    try {
      res = await client.rpc(fn, args || {});
    } catch (e) {
      throw new Error(friendly(e && e.message));
    }
    if (res.error) throw new Error(friendly(res.error.message));
    return res.data;
  }

  function live(code, onChange) {
    var channel = null;
    if (client) {
      try {
        channel = client.channel('teamsheet-' + code, { config: { broadcast: { self: false } } });
        channel.on('broadcast', { event: 'changed' }, function () { onChange(); });
        channel.subscribe();
      } catch (e) {
        channel = null; // the page still refreshes every few seconds
      }
    }
    return {
      ping: function () {
        if (!channel) return;
        try {
          channel.send({ type: 'broadcast', event: 'changed', payload: {} });
        } catch (e) { /* ignore */ }
      },
      stop: function () {
        if (channel) try { client.removeChannel(channel); } catch (e) { /* ignore */ }
      }
    };
  }

  root.TeamsheetAPI = { configured: configured, call: call, live: live };
})(window);
