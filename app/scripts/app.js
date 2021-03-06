(function($) {
  'use strict';

  // Cache DOM elements
  var $urlInput = $('.yp-url');
  var $postBox = $('#yp-post-area textarea');
  var $addBtn = $('#yp-add-btn');
  var $recentPosts = $('.yp-recent-posts');
  var $topPosts = $('.yp-top-posts');
  var fetchTimeout;

  var user; // current user info
  var player; // current youtube player

  function getVideoId(url) {
    var idRegex = /youtube\.com\/watch\?v=(.*?)($|&)/i;
    var videoID = url.match(idRegex);
    if (videoID) {
      videoID = videoID[1];
    }
    return videoID;
  }

  function prettyPrintTime(time) {
    // Hours, minutes and seconds
    var hrs = Math.floor(time / 3600);
    var mins = Math.floor((time % 3600) / 60);
    var secs = time % 60;

    // Output like '1:01' or '4:03:59' or '123:03:59'
    var ret = '';

    if (hrs > 0) {
      ret += '' + hrs + ':' + (mins < 10 ? '0' : '');
    }

    ret += '' + mins + ':' + (secs < 10 ? '0' : '');
    ret += '' + secs;

    return ret;
  }

  function createPost(post) {
    // TODO: would be cleaner to use a template library
    return '<div class="post clearfix" post-id="' + post.id + '">' +
             '<div class="post-email" title="' + post.email + '">' +
               post.email +
             '</div>' +
             '<div class="post-content">' +
               post.content +
             '</div>' +
             '<div class="post-footer">' +
               '<div class="post-time">' +
                 prettyPrintTime(post.vtime) +
               '</div>' +
               '<div class="post-date">' +
                 post.timestamp +
               '</div>' +
               '<div class="post-like">' +
                 '<span class="post-like-count">' +
                   (post.likes || 0) +
                 '</span>' +
                 '<button class="like glyphicon glyphicon-thumbs-up' +
                 (post.myLikes === 1? ' active' : '') +
                 '" aria-hidden="true"></button>' +
                 '<button class="dislike glyphicon glyphicon-thumbs-down' +
                 (post.myLikes === -1? ' active' : '') +
                 '" aria-hidden="true"></button>' +
               '</div>' +
           '</div>';
  }

  function displayPosts($container, data) {
    $container.empty();
    $.each(data, function(index, post) {
      var postHtml = createPost(post);
      $container.append(postHtml);
    });
  }

  function startFetching(once) {
    /*jshint camelcase: false */

    // Stop previous fetches
    stopFetching();

    var videoId = player.getVideoData().video_id;
    var currentTime = player.getCurrentTime();
    var email = (user && user.email) || '';
    var fetchOptions = {
      video: videoId,
      vtime: currentTime,
      email: email
    };

    var recentPromise = $.getJSON('server/recent.php', fetchOptions);
    var topPromise = $.getJSON('server/top.php', fetchOptions);

    $.when(recentPromise, topPromise).done(function(recentData, topData) {
      displayPosts($recentPosts, recentData[0]);
      displayPosts($topPosts, topData[0]);

      if (!once) {
        clearTimeout(fetchTimeout);
        fetchTimeout = setTimeout(startFetching, 5000);
      }
    });
  }

  function stopFetching() {
    clearTimeout(fetchTimeout);
  }

  function onPlayerStateChange(state) {
    if (state.data === YT.PlayerState.PLAYING) {
      startFetching();
    } else if (state.data === YT.PlayerState.PAUSED ||
      state.data === YT.PlayerState.ENDED) {
      stopFetching();
    }
  }

  function login(ytUser) {
    user = ytUser;
    $('#yp-profile-img').empty().append('<img src="' + user.picture + '">');
  }

  function logout() {
    user = null;
  }

  window.onYouTubeIframeAPIReady = function() {
    /*jshint camelcase: false */

    player = new YT.Player('player', {
      videoId: 'i5ZM0-f5_CU', // default video
      playerVars: {
        iv_load_policy: 3 // turn off annotations
      },
      events: {
        onStateChange: onPlayerStateChange
      }
    });
  };
  
  $('.yp-watch').click(function() {
    var url = $.trim($urlInput.val());
    if (url) {
      player.loadVideoById(getVideoId(url));
    }
  });

  $addBtn.click(function() {
    /*jshint camelcase: false */

    if (!user) {
      window.alert('Please log in first!');
      return;
    }

    if ($addBtn.hasClass('disabled')) {
      return;
    }

    var comment = $.trim($postBox.val());

    if (comment === '') {
      return;
    }

    $addBtn.addClass('disabled');
    $postBox.attr('disabled', 'disabled');

    $.post('server/insert.php', {
      // TODO: don't send email directly, this is not safe.
      // Users can pretend to be someone else, send back the
      // auth token instead.
      email: user.email,
      content: comment,
      video: player.getVideoData().video_id,
      vtime: player.getCurrentTime()
    }).done(function() {
      $addBtn.removeClass('disabled');
      $postBox.removeAttr('disabled').val('');
      startFetching(player.getPlayerState() !== YT.PlayerState.PLAYING);
    });
  });

  $('.yp-posts-container').on('click', '.like, .dislike', function() {
    if (!user) {
      window.alert('Please log in to vote');
      return;
    }

    var $this = $(this);
    var isLike = $this.hasClass('like');
    var $likeBtn = isLike? $this : $this.prev();
    var $dislikeBtn = $likeBtn.next();
    var isActive = $this.hasClass('active');
    var isOtherActive = isLike? $dislikeBtn.hasClass('active') : $likeBtn.hasClass('active');
    var count = +$likeBtn.prev().text();
    var postId = $this.closest('.post').attr('post-id');
    var liked;

    if (isLike && isActive && !isOtherActive) {
      count--;
      liked = 0;
    } else if (isLike && !isActive && !isOtherActive) {
      count++;
      liked = 1;
    } else if (isLike && !isActive && isOtherActive) {
      count += 2;
      liked = 1;
    } else if (!isLike && isActive && !isOtherActive) {
      count++;
      liked = 0;
    } else if (!isLike && !isActive && !isOtherActive) {
      count--;
      liked = -1;
    } else if (!isLike && !isActive && isOtherActive) {
      count -= 2;
      liked = -1;
    } else {
      // Both active? That's impossible... return!
      return;
    }

    var $posts = $('.post[post-id="' + postId + '"]');
    $posts.find('.post-like-count').text(count);

    var $likes = $posts.find('.like').removeClass('active');
    var $dislikes = $posts.find('.dislike').removeClass('active');

    if (liked === 1) {
      $likes.addClass('active');
    } else if (liked === -1) {
      $dislikes.addClass('active');
    }

    $.post('server/like.php', {
      email: user.email,
      postid: postId,
      liked: liked
    });
  });

  window.youpost = {
    login: login,
    logout: logout
  };

})(jQuery);