package com.zerosixty.game;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.tasks.Task;

// Google Play Games for the web game: who's signed in, the sign-in fallback, and the high-score leaderboard.
// The game reaches it as window.Capacitor.Plugins.PlayGames.
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final int RC_LEADERBOARD = 9004;

    // Play Games stays off until the project ID from Play Console is filled in (res/values/play_games.xml)
    static boolean configured(Context context) {
        return !context.getString(R.string.game_services_project_id).trim().isEmpty();
    }

    private String leaderboard() {
        String id = getContext().getString(R.string.leaderboard_high_score).trim();
        return id.isEmpty() ? null : id;
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (!configured(getContext())) {
            call.resolve(result(false, false, null));
            return;
        }
        // waits for the automatic sign-in at launch if it's still going
        PlayGames.getGamesSignInClient(getActivity()).isAuthenticated().addOnCompleteListener((task) -> report(call, task));
    }

    // only needed when the automatic sign-in didn't go through
    @PluginMethod
    public void signIn(PluginCall call) {
        if (!configured(getContext())) {
            call.reject("Play Games isn't set up for this build");
            return;
        }
        PlayGames.getGamesSignInClient(getActivity()).signIn().addOnCompleteListener((task) -> report(call, task));
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        String id = leaderboard();
        Long score = call.getLong("score");
        if (id != null && score != null && configured(getContext())) PlayGames.getLeaderboardsClient(getActivity()).submitScore(id, score);
        call.resolve();
    }

    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        String id = leaderboard();
        if (id == null || !configured(getContext())) {
            call.reject("No leaderboard is set up for this build");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity())
            .getLeaderboardIntent(id)
            .addOnSuccessListener((intent) -> {
                // Play Games needs startActivityForResult to know which game is asking
                getActivity().startActivityForResult(intent, RC_LEADERBOARD);
                call.resolve();
            })
            .addOnFailureListener((e) -> call.reject(e.getMessage()));
    }

    private void report(PluginCall call, Task<AuthenticationResult> task) {
        boolean signedIn = task.isSuccessful() && task.getResult().isAuthenticated();
        if (!signedIn) {
            call.resolve(result(true, false, null));
            return;
        }
        PlayGames.getPlayersClient(getActivity())
            .getCurrentPlayer()
            .addOnCompleteListener((player) -> call.resolve(result(true, true, player.isSuccessful() ? player.getResult().getDisplayName() : null)));
    }

    private JSObject result(boolean available, boolean signedIn, String name) {
        JSObject o = new JSObject();
        o.put("available", available);
        o.put("signedIn", signedIn);
        o.put("name", name == null ? "" : name);
        o.put("leaderboard", available && leaderboard() != null);
        return o;
    }
}
