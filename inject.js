chrome.runtime.sendMessage({}, function (response) {
  var pip = {
    settings: {
      popKeyCode: 82,    // default: R
    }
  };

  chrome.storage.sync.get(pip.settings, function (storage) {
    pip.settings.popKeyCode = Number(storage.popKeyCode);
    initializeWhenReady(document);
  });

  var forEach = Array.prototype.forEach;

  function definePipController() {
    pip.pipController = function (target, parent) {
      if (target.dataset['pipid']) {
        return;
      }

      this.video = target;
      this.parent = target.parentElement || parent;
      this.document = target.ownerDocument;
      this.id = Math.random().toString(36).substr(2, 9);
      this.initializeControls();


    };


    pip.pipController.prototype.initializeControls = function () {
      var document = this.document;
      // if (!document.pictureInPictureEnabled) {
      //   console.log('Picture-in-Picture NOT supported');
      //   return;
      // }


      var prevent = function (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      var wrapper = document.createElement('div');
      wrapper.classList.add('pip-controller');
      wrapper.dataset['pipid'] = this.id;
      wrapper.addEventListener('dblclick', prevent, true);
      wrapper.addEventListener('mousedown', prevent, true);
      wrapper.addEventListener('click', prevent, true);
      top = Math.max(this.video.offsetTop, 0) + 10 + "px",
        right = Math.max(this.video.offsetRight, 0) + "px";
      var shadow = wrapper.createShadowRoot();
      var shadowTemplate = `
        <style>
          @import "${chrome.runtime.getURL('shadow.css')}";
        </style>

        <div id="pipController" style="top:${top}; right:${right}">
        <span><button data-action="pop" class="rw"><img data-action="pop" src="${chrome.runtime.getURL('icons/icon19w.png')}" style="vertical-align: middle;"/></button></span>
          <span id="controls">
          <button data-action="display" class="rw">X</button>
          </span>
        </div>
      `;
      shadow.innerHTML = shadowTemplate;
      forEach.call(shadow.querySelectorAll('button'), function (button) {
        button.onclick = (e) => {
          runAction(e.target.dataset['action'], document, false, e);
        }
      });
      forEach.call(shadow.querySelectorAll('img'), function (button) {
        button.onclick = (e) => {
          runAction(e.target.dataset['action'], document, false, e);
        }
      });

      var fragment = document.createDocumentFragment();
      fragment.appendChild(wrapper);

      this.video.classList.add('pip-initialized');
      this.video.dataset['pipid'] = this.id;

      switch (true) {
        case (location.hostname == 'www.amazon.com'):
        case (location.hostname == 'www.reddit.com'):
        case (/hbogo\./).test(location.hostname):
          // insert before parent to bypass overlay
          this.parent.parentElement.insertBefore(fragment, this.parent);
          break;

        default:
          // Note: when triggered via a MutationRecord, it's possible that the
          // target is not the immediate parent. This appends the controller as
          // the first element of the target, which may not be the parent.
          this.parent.insertBefore(fragment, this.parent.firstChild);
      }
    }
  }

  function initializeWhenReady(document) {

    window.onload = () => {
      initializeNow(window.document)
    };
    if (document) {
      if (document.readyState === "complete") {
        initializeNow(document);
      } else {
        document.onreadystatechange = () => {
          if (document.readyState === "complete") {
            initializeNow(document);
          }
        }
      }
    }
  }
  function inIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }
  function initializeNow(document) {
    // enforce init-once due to redundant callers
    if (!document.body || document.body.classList.contains('pip-initialized')) {
      return;
    }
    document.body.classList.add('pip-initialized');

    if (document === window.document) {
      definePipController();
    } else {
      var link = document.createElement('link');
      link.href = chrome.runtime.getURL('inject.css');
      link.type = 'text/css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    var docs = Array(document)
    try {
      if (inIframe())
        docs.push(window.top.document);
    } catch (e) {
    }

    docs.forEach(function (doc) {
      doc.addEventListener('keydown', function (event) {
        var keyCode = event.keyCode;

        // Ignore if following modifier is active.
        if (!event.getModifierState
          || event.getModifierState("Alt")
          || event.getModifierState("Control")
          || event.getModifierState("Fn")
          || event.getModifierState("Meta")
          || event.getModifierState("Hyper")
          || event.getModifierState("OS")) {
          return;
        }

        // Ignore keydown event if typing in an input box
        if ((document.activeElement.nodeName === 'INPUT'
          && document.activeElement.getAttribute('type') === 'text')
          || document.activeElement.nodeName === 'TEXTAREA'
          || document.activeElement.isContentEditable) {
          return false;
        }

        if (keyCode == pip.settings.popKeyCode) {
          runAction('pop', document, true)
        }

        return false;
      }, true);
    });

    function checkForVideo(node, parent, added) {
      if (node.nodeName === 'VIDEO') {
        if (added) {
          new pip.pipController(node, parent);
        } else {
          if (node.classList.contains('pip-initialized')) {
            let id = node.dataset['pipid'];
            let ctrl = document.querySelector(`div[data-pipid="${id}"]`)
            if (ctrl) {
              ctrl.remove();
            }
            node.classList.remove('pip-initialized');
            delete node.dataset['pipid'];
          }
        }
      } else if (node.children != undefined) {
        for (var i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          checkForVideo(child, child.parentNode || parent, added);
        }
      }
    }

    var observer = new MutationObserver(function (mutations) {
      // Process the DOM nodes lazily
      requestIdleCallback(_ => {
        mutations.forEach(function (mutation) {
          forEach.call(mutation.addedNodes, function (node) {
            if (typeof node === "function")
              return;
            checkForVideo(node, node.parentNode || mutation.target, true);
          });
          forEach.call(mutation.removedNodes, function (node) {
            if (typeof node === "function")
              return;
            checkForVideo(node, node.parentNode || mutation.target, false);
          });
        });
      }, { timeout: 1000 });
    });
    observer.observe(document, { childList: true, subtree: true });

    var videoTags = document.getElementsByTagName('video');
    forEach.call(videoTags, function (video) {
      new pip.pipController(video);
    });

    var frameTags = document.getElementsByTagName('iframe');
    forEach.call(frameTags, function (frame) {
      // Ignore frames we don't have permission to access (different origin).
      try { var childDocument = frame.contentDocument } catch (e) { return }
      initializeWhenReady(childDocument);
    });
  }

  function runAction(action, document, keyboard, e) {
    console.log("Pop button clicked!")
    var videoTags = document.getElementsByTagName('video');
    videoTags.forEach = Array.prototype.forEach;

    videoTags.forEach(function (v) {
      var id = v.dataset['pipid'];
      var controller = document.querySelector(`div[data-pipid="${id}"]`);

      showController(controller);

      if (!v.classList.contains('pip-cancelled')) {
        if (action === 'pop') {
          console.log(document === window.document);
          (async () => {
            const video = document.querySelector('video');

            if (video.hasAttribute('__pip__')) {
              await document.exitPictureInPicture();
            } else {
              await video.requestPictureInPicture();
              video.setAttribute('__pip__', true);
              video.addEventListener('leavepictureinpicture', event => {
                video.removeAttribute('__pip__');
              }, { once: true });
            }
          })();
        } else if (action === 'display') {
          controller.classList.add('pip-manual');
          controller.classList.toggle('pip-hidden');
        }
      }
    });
  }


  var timer;
  var animation = false;
  function showController(controller) {
    controller.classList.add('pip-show');

    if (animation)
      clearTimeout(timer);

    animation = true;
    timer = setTimeout(function () {
      controller.classList.remove('pip-show');
      animation = false;
    }, 2000);
  }
});
