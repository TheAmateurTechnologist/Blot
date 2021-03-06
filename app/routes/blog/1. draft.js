module.exports = function route (server) {

  var Entry = require('../../models/entry');
  var Entries = require('../../models/entries');
  var plugins = require('../../plugins');
  var drafts = require('../../drafts');
  var redis = require('redis');

  server.get(drafts.streamRoute, function(req, res, next){

    var blogID = req.blog.id;
    var client = redis.createClient();
    var path = drafts.getPath(req.url, drafts.streamRoute);

    req.socket.setTimeout(Number.MAX_VALUE);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    res.write('\n');

    var channel = 'blog:' + blogID +
                  ':draft:' + path;

    client.subscribe(channel);

    client.on('message', function(_channel){

      if (_channel !== channel) return;

      renderDraft(req, res, next, path, function(html, bodyHTML){

        res.write('\n');
        res.write('data: ' + JSON.stringify(bodyHTML.trim()) + '\n\n');
        res.flush();
      });
    });

    // In case we encounter an error...print it out to the console
    client.on('error', function(err) {
      console.log('Redis Error: ' + err);
    });

    req.on('close', function() {
      client.unsubscribe();
      client.quit();
    });
  });

  server.get(drafts.viewRoute, function(request, response, next){

    // console.log('Draft: Request to a draft view page ' + request.url);

    var filePath = drafts.getPath(request.url, drafts.viewRoute);

    renderDraft(request, response, next, filePath, function(html){

      // bodyHTML is passed after HTML
      response.send(html);
    });
  });

  function renderDraft (request, response, next, filePath, callback) {

    var blog = request.blog,
        blogID = blog.id;

    // console.log('Draft: Rendering draft HTML for entry at: ' + filePath);

    Entry.getByPath(blogID, filePath, function(entry){

      if (!entry) return next();

      // GET FULL ENTRY RETURNS NULL SINCE IT"S DRAFT
      // HOW DO WE RESOLVE THIS NEATLY? WHERE TO DRAW
      // THE LINE TO SHOW OR NOT TO SHOW?
      // PERHAPS PASS {drafts: show}? or something?

      Entries.adjacentTo(blogID, entry.id, function(nextEntry, previousEntry){

        entry.next = nextEntry;
        entry.previous = previousEntry;
        entry.adjacent = !!(nextEntry || previousEntry);

        plugins.load('entryHTML', blog.plugins, function(err, pluginHTML){

          // Dont show dates on a page
          if (blog.hideDates || entry.menu) delete entry.date;

          // Dont show plugin HTML on a page
          if (entry.menu) pluginHTML = '';

          response.addPartials({pluginHTML: pluginHTML});

          response.addLocals({
            pageTitle: entry.title + ' - ' + blog.title,
            pageDescription: entry.summary,
            entry: entry
          });

          response.renderView('entry', next, function(err, output) {

            drafts.injectScript(output, filePath, callback);
          });
        });
      });
    });
  }
};