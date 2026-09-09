/* Plain native helpers for one-shot measured-beat deck sync. */
(function (global) {
  'use strict';

  const dj = global.dj = global.dj || {};
  const beat = dj.beat = dj.beat || {};

  function hasUsableBeatMap(result) {
    return Boolean(
      result && Number.isFinite(result.bpm) && result.bpm > 0 &&
      Array.isArray(result.ticks) && result.ticks.length >= 2
    );
  }

  function findNextTick(ticks, mediaTime) {
    let low = 0;
    let high = ticks.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (ticks[middle] < mediaTime) low = middle + 1;
      else high = middle;
    }
    return low < ticks.length ? ticks[low] : null;
  }

  function unavailable(reason) {
    return { enabled: false, reason: reason, plan: null };
  }

  function getAutoLoopPlan(options) {
    const result = options.result;
    const beats = Number(options.beats);
    const duration = Number(options.duration);
    const currentTime = Number(options.currentTime);
    if (!hasUsableBeatMap(result)) return unavailable('Auto Loop needs a measured beat map.');
    if (beats !== 4 && beats !== 8 && beats !== 16) return unavailable('Choose 4, 8, or 16 beats.');
    if (!(duration > 0) || !Number.isFinite(currentTime)) return unavailable('Track duration is unavailable.');

    let startIndex = Number.isInteger(options.startIndex) ? options.startIndex : -1;
    if (startIndex < 0) {
      for (let index = 0; index < result.ticks.length; index += 1) {
        if (result.ticks[index] <= currentTime + 0.01) startIndex = index;
        else break;
      }
      if (startIndex < 0) startIndex = 0;
    }
    const endIndex = startIndex + beats;
    if (startIndex >= result.ticks.length || endIndex >= result.ticks.length) {
      return unavailable('Not enough measured beats remain for a ' + beats + '-beat loop.');
    }
    const start = Number(result.ticks[startIndex]);
    const end = Number(result.ticks[endIndex]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) {
      return unavailable('The measured ' + beats + '-beat loop does not fit in this track.');
    }
    return { enabled: true, reason: '', plan: { start: start, end: end, startIndex: startIndex, beats: beats } };
  }

  function getSyncPlan(options) {
    const leader = options.leaderAudio;
    const follower = options.followerAudio;
    const leaderResult = options.leaderResult;
    const followerResult = options.followerResult;
    const maximumPitch = Number.isFinite(options.maximumPitch) ? options.maximumPitch : 8;

    if (!options.leaderTrack || !options.followerTrack || !leader || !follower) {
      return unavailable('Load both decks.');
    }
    if (!hasUsableBeatMap(leaderResult) || !hasUsableBeatMap(followerResult)) {
      return unavailable('Both decks need usable Degara beat maps.');
    }
    if (options.leaderLoopActive || options.followerLoopActive) {
      return unavailable('Exit both loops before one-shot sync.');
    }
    if (leader.ended || follower.ended) return unavailable('Ended tracks cannot be synced.');
    if (leader.paused || leader.seeking || leader.readyState < 2) {
      return unavailable('Start the leader deck first.');
    }
    if (follower.seeking || follower.readyState < 1) return unavailable('Follower deck is not ready.');
    if (!Number.isFinite(leader.duration) || leader.duration <= 0 ||
        !Number.isFinite(follower.duration) || follower.duration <= 0) {
      return unavailable('Both tracks need valid duration metadata.');
    }

    const leaderRate = leader.playbackRate;
    if (!Number.isFinite(leaderRate) || leaderRate <= 0) return unavailable('Leader playback rate is invalid.');
    const leaderTime = leader.currentTime;
    const followerTime = follower.currentTime;
    if (!Number.isFinite(leaderTime) || !Number.isFinite(followerTime)) {
      return unavailable('Playback position is unavailable.');
    }

    // Require a little scheduling room, but always choose a measured Degara tick.
    const leaderTick = findNextTick(leaderResult.ticks, leaderTime + leaderRate * 0.12);
    if (leaderTick === null || leaderTick >= leader.duration) {
      return unavailable('No later analyzed leader beat is available.');
    }

    const rawRate = leaderResult.bpm * leaderRate / followerResult.bpm;
    const pitch = Math.round((rawRate - 1) * 1000) / 10;
    if (!Number.isFinite(pitch) || Math.abs(pitch) > maximumPitch) {
      return unavailable('Tempo gap exceeds the ±' + maximumPitch + '% pitch range.');
    }
    const followerRate = 1 + pitch / 100;
    const wallSeconds = (leaderTick - leaderTime) / leaderRate;
    const projectedFollowerTime = follower.paused
      ? followerTime
      : followerTime + wallSeconds * followerRate;
    const followerTick = findNextTick(followerResult.ticks, projectedFollowerTime + 0.01);
    if (followerTick === null || followerTick >= follower.duration) {
      return unavailable('No later analyzed follower beat is available.');
    }

    return {
      enabled: true,
      reason: '',
      plan: {
        leaderTick: leaderTick,
        followerTick: followerTick,
        leaderRate: leaderRate,
        followerRate: followerRate,
        pitch: pitch,
        followerWasPaused: follower.paused,
        leaderTrackUrl: options.leaderTrack.url,
        followerTrackUrl: options.followerTrack.url,
        leaderResult: leaderResult,
        followerResult: followerResult
      }
    };
  }

  beat.hasUsableBeatMap = hasUsableBeatMap;
  beat.findNextTick = findNextTick;
  beat.getSyncPlan = getSyncPlan;
  beat.getAutoLoopPlan = getAutoLoopPlan;
}(window));
