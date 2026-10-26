package com.zerosixty.game;

import android.app.Application;
import com.google.android.gms.games.PlayGamesSdk;

public class ZeroSixtyApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        // Play Games signs the player in by itself at launch, once the game's Play Console project is set
        if (PlayGamesPlugin.configured(this)) PlayGamesSdk.initialize(this);
    }
}
