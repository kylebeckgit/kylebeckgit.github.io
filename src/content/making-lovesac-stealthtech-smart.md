# Making Lovesac Stealthtech Smart

**TLDR**: I was frustrated that StealthTech doesn't have AirPlay, so I found a way to add it with a WiiM streamer.

Then I ran into a new problem: changing inputs is a pain. We mostly watch TV through the system, but now and then I want to play music on it with my HomePods.

So I solved that with Home Assistant and a Bluetooth chip.

**Bonus points!** I can now use Siri commands with StealthTech, and my wife and I can both control the Lovesac from our phones without kicking the other off.

Lots of details below. Some of it is nerdy, fair warning. I've tried to explain the techy words as we go, and there's a short glossary right after this.

**Disclaimer**: I'm tech-savvy, but I don't care for getting too into the weeds with scripting home automation stuff. I leaned a lot on Grok Bot for planning this, coding it, and setting up Home Assistant. So if you think you aren't savvy enough to pull this off, I'd say give it a shot anyway. The tools are good enough today that you can describe what you want and have it built for you. I'm happy to help out as well if I can, so feel free to [get in touch](https://kyle-beck.com/contact/).

This isn't affiliated with Lovesac. It works by talking to the system in a way Lovesac doesn't officially support, so try it at your own risk. I’ve used it with great success however so take that for what its worth. 

## The words you'll see

- **[Home Assistant](https://www.home-assistant.io/)** is free software that runs in your house and connects all your smart devices in one place, so they can work together. Everything here hangs off it.
- **Bluetooth proxy** is a tiny, cheap gadget that sits in a room and passes Bluetooth signals along to Home Assistant over your Wi-Fi.
- **[ESPHome](https://esphome.io/)** is the free software that turns that little gadget into a Bluetooth proxy.
- **Integration** is an add-on that teaches Home Assistant how to talk to one kind of device.
- **HDMI-ARC** is the HDMI connection that sends your TV's sound to the soundbar. **Optical** is a second, separate cable that carries digital audio.
- **A virtual machine (VM)** is a pretend computer running inside your real one. Mine runs Home Assistant on my Mac Studio, which is on 24/7. 
- **[HomeKit](https://www.apple.com/ios/home/)** is Apple's smart home system, which is how Siri and the Home app control things.

## Why StealthTech needed help

We have HomePods around the house and a Lovesac StealthTech Sound + Charge system in the Sactionals in our living room, which handles our TV audio. StealthTech is a "dumb" system, meaning it can't join your smart home out of the box. It only takes HDMI-ARC, optical, Bluetooth, and AUX. There's no AirPlay support.

The Lovesac app made things worse in a two-person house. Only one phone can hold the Bluetooth control connection at a time, so whoever opens the app kicks the other person off.

## The Setup

I fed the StealthTech with a WiiM music streamer, connected over an optical cable. (You can use aux, but optical gives you the best sound quality.) Then I put a tiny Bluetooth proxy next to the couch so Home Assistant could talk to the Lovesac, and built a shared phone remote with Siri controls like mute on top.

Now when I AirPlay to the WiiM and the HomePods together, the couch joins the rest of the house's music automatically. When the music stops, it switches itself back to the TV. My wife and I can use the same remote at the same time, and Siri can control it from anywhere in the house.

Let's get into the nerdier bits.

## What I Used

| Piece | What it's for |
|---|---|
| [WiiM Mini](https://www.amazon.com/dp/B09HC5GRKY) | A small streamer that adds AirPlay, Spotify Connect and app playback, and feeds the StealthTech over optical |
| Optical cable (the one that came with your StealthTech works fine; if you've misplaced it, [this Amazon Basics 6 ft cable](https://www.amazon.com/dp/B00NH11H38) will do. Aux works too, but optical sounds best) | Connects the WiiM to the StealthTech center channel |
| [M5Stack ATOM Lite](https://shop.m5stack.com/products/atom-lite-esp32-development-kit) (a tiny ESP32 board) | The Bluetooth proxy. Plug it in somewhere close to the sound bar |
| [Home Assistant OS](https://www.home-assistant.io/installation/) | The Home Assistant software. Mine runs in a virtual machine on my Mac Studio |
| [lovesac_stealthtech](https://github.com/ojiudezue/ha-lovesac-stealthtech) | A community integration that controls power, volume, mute, input, sound mode, EQ and Quiet Couch over Bluetooth |
| [Home Assistant Companion app](https://companion.home-assistant.io/) | The shared Couch remote on both our phones |
| [HomeKit Bridge](https://www.home-assistant.io/integrations/homekit/) (built into Home Assistant) | Shares one "TV Mute" switch with Siri and the HomePods |

## WiiM into optical, HomePods in the group

I left the TV on HDMI-ARC and plugged the WiiM into the optical input. When we want music, we AirPlay to the HomePods and the WiiM together. The WiiM shows up as an AirPlay 2 speaker right next to the HomePods, so I can send to all of them at once. The couch gets the music over optical, and the rest of the house gets it over AirPlay.

Home Assistant's built-in [WiiM integration](https://www.home-assistant.io/integrations/wiim/) found the WiiM on its own. One annoyance is that every kind of playback (AirPlay, Spotify Connect, the WiiM app) is labeled as the source `"Network"`, so you can't single out AirPlay. I just trigger on whether it's `playing`.

## Why the Bluetooth chip has to sit by the couch

Home Assistant runs in a virtual machine on my Mac Studio, which is nowhere near the couch, so it can't reach the StealthTech over Bluetooth from there. An [ESPHome Bluetooth proxy](https://esphome.io/projects/) solves that. It's a small board near the StealthTech that passes the Bluetooth connection back to Home Assistant over Wi-Fi.

I used an [M5Stack ATOM Lite](https://shop.m5stack.com/products/atom-lite-esp32-development-kit). You flash it from your browser over USB using the [ESPHome projects page](https://esphome.io/projects/) (the Generic ESP32 option works if your board isn't listed), connect it to Wi-Fi, and Home Assistant picks it up. On this firmware the little light stays off. That worried me for a minute, but it's normal.

My first try was plugging it in somewhere convenient, and the signal was weak, around -97 dBm (dBm is signal strength, and closer to zero is better). Commands barely worked. Once I moved it right next to the couch it came in around -50 dBm and everything started working. So the lesson I learned is that it really does need to be close.

The ATOM Lite worked well for me once it was close to the couch.

## The StealthTech integration

[`ojiudezue/ha-lovesac-stealthtech`](https://github.com/ojiudezue/ha-lovesac-stealthtech) talks to the StealthTech hub using the Bluetooth commands that the [libstealthtech](https://github.com/jackspirou/libstealthtech) project figured out by reverse engineering. It covers power, volume, mute, inputs (`HDMI-ARC`, `Optical`, `Bluetooth`, `AUX`), sound modes, EQ, Quiet Couch and the Sync button.

To install it, I used Home Assistant's built-in [Marketplace](https://www.home-assistant.io/integrations/marketplace/) (Settings, then Marketplace). Add the GitHub repository as a custom repository (it has you approve the connection on GitHub, so your password never goes into Home Assistant), install it, and restart. On my system the media player is called `media_player.living_room_lovesac_stealthtech`, and the WiiM showed up as `media_player.couch`.

There's the same limit here as with the app: the hub only allows one Bluetooth control connection. If the Lovesac app is open on anyone's phone, Home Assistant's commands fail and the hub eventually shows as unavailable. We keep that app closed. Bluetooth audio from a phone is a separate connection, so it can still work while Home Assistant keeps control.

## How we use it

When the WiiM starts playing, the StealthTech wakes up if it's off, waits a few seconds, then switches to Optical. When the WiiM has been idle, paused or off for 30 seconds and the hub is still on Optical, it switches back to HDMI-ARC.

Two small gotchas. The source names have to match exactly, so it's `HDMI-ARC` with a hyphen. And the hub ignores input changes while it's off, so the first automation turns it on before switching.

Here are the two automations, in case you want to copy them:

```yaml
- id: stealthtech_optical_when_wiim_plays
  alias: "StealthTech: switch to Optical when the WiiM plays"
  description: >-
    The WiiM feeds the StealthTech over optical. When it starts playing, power
    the hub on if needed and select Optical, unless Optical is already selected.
    Fires on any WiiM playback (AirPlay, Spotify Connect, app, etc.): the native
    WiiM integration reports every streaming service as source "Network".
  mode: single
  max_exceeded: silent
  triggers:
    - trigger: state
      entity_id: media_player.couch
      to: "playing"
      for:
        seconds: 2
  conditions: []
  actions:
    - if:
        - condition: state
          entity_id: media_player.living_room_lovesac_stealthtech
          state: "off"
      then:
        - action: media_player.turn_on
          target:
            entity_id: media_player.living_room_lovesac_stealthtech
        - delay:
            seconds: 4
    - if:
        - condition: template
          value_template: >-
            {{ state_attr('media_player.living_room_lovesac_stealthtech', 'source') != 'Optical' }}
      then:
        - action: media_player.select_source
          target:
            entity_id: media_player.living_room_lovesac_stealthtech
          data:
            source: "Optical"

- id: stealthtech_hdmi_after_wiim_stops
  alias: "StealthTech: back to HDMI-ARC 30 s after the WiiM stops"
  description: >-
    After the WiiM has been idle, paused, or off for 30 seconds, return the
    StealthTech to HDMI-ARC (TV). Only fires if the hub is on and still on
    Optical, so it never overrides Bluetooth/AUX.
  mode: single
  max_exceeded: silent
  triggers:
    - trigger: state
      entity_id: media_player.couch
      to:
        - "idle"
        - "paused"
        - "off"
        - "standby"
        - "unavailable"
      for:
        seconds: 30
  conditions:
    - condition: state
      entity_id: media_player.living_room_lovesac_stealthtech
      state: "on"
    - condition: template
      value_template: >-
        {{ state_attr('media_player.living_room_lovesac_stealthtech', 'source') == 'Optical' }}
    - condition: not
      conditions:
        - condition: state
          entity_id: media_player.couch
          state:
            - "playing"
            - "buffering"
  actions:
    - action: media_player.select_source
      target:
        entity_id: media_player.living_room_lovesac_stealthtech
      data:
        source: "HDMI-ARC"
```

## One remote for both of us, plus Siri

This is the part that actually changed day-to-day life in a house with more than one person.

With Lovesac's app, control is a single seat. One phone connects, and the other is locked out until the first person closes the app or walks out of range. If someone has the app open upstairs, you can't change the volume from the couch. That's just how it's built.

With Home Assistant in the middle, it works differently. The Companion app on my phone and on my wife's phone both talk to Home Assistant over Wi-Fi, and Home Assistant is the only thing that opens short Bluetooth connections to the hub. So neither of us fights over that one Bluetooth slot. We can both have the remote open, change the volume, switch inputs and hit mute, and nobody gets kicked off.

I built a Couch dashboard for it, with big Power, Mute, Vol - and Vol + buttons. There are input buttons for TV, Music (Optical / WiiM), Bluetooth and AUX, plus sound modes and Quiet Couch. A More section holds the tone controls, a Resync button and the WiiM's play controls. My wife has her own non-admin login, the dashboard shows up in the sidebar for both of us, and either of us can set it as the app's default page. It only works on our home Wi-Fi.

One button on the dashboard is worth explaining: Resync. Home Assistant keeps its own record of whether the StealthTech is on or off, and sometimes that record gets out of step with reality. I've seen the remote say the hub was on when it was actually off. When that happens, tapping Power does the wrong thing, and the music automation switches inputs based on bad information. Resync is the integration's Sync button. It makes Home Assistant ask the hub for its real status again. If the remote ever seems confused, tap it first. It's tucked under More right now, but next time I'd put it right on the main screen.

One thing you'll notice is a small delay. Each tap on the remote takes about 1 to 3 seconds to take effect. That's because Home Assistant has to open a fresh Bluetooth connection to the StealthTech for each command, send it, and then hang up again.

There's a setting in the integration that helps, called `idle_timeout`. It controls how long Home Assistant keeps that Bluetooth connection open after your last tap before hanging up. It was set to 5 seconds, and I raised it to 30. That way, if you tap a few times in a row, Home Assistant doesn't have to reconnect each time, and the remote feels less sluggish.

The tradeoff is that the StealthTech only allows one Bluetooth control connection at a time. While Home Assistant is holding it open, the Lovesac app can't connect. With a 30-second timeout, that means the app is locked out for 30 seconds after your last tap. That's fine for us, since we don't use the Lovesac app anymore.

Siri is the other win here. I wrapped the StealthTech mute in a "TV Mute" switch and shared only that switch through Home Assistant's HomeKit Bridge. You pair the bridge once from the Home app, drop TV Mute into the Living Room, and then anyone in the Home can use it from a phone or a HomePod. Saying "Hey Siri, turn on TV Mute" mutes the couch. You don't need the Companion app open, and you don't need to know who last had the Lovesac app. You just ask. (Apple really should just let you mute the Apple TV under all circumstances, but Apple does Apple things so this works intead). 

## Things that might trip you up

If Home Assistant stops responding to the couch, the most likely reason is that someone opened the Lovesac app. I'd leave it closed, or even delete it once Home Assistant is set up, so it can't get in the way.

Also, a dark light on the ATOM Lite doesn't mean it's bricked. It lights up when you first plug it in, but once you flash the firmware this setup needs, the light stays off.

#grok bot/home#

