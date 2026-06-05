(function () {
    'use strict';

    function startPlugin() {
        try {
            var button = $('<li class="menu__item selector"><div class="menu__ico"><svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm2 2l6 4-6 4V8z"/></svg></div><div class="menu__text">OPhim</div></li>');

            button.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: 'OPhim Viet',
                    component: 'ophim_main',
                    page: 1
                });
            });

            $('.menu .menu__list').eq(0).append(button);
        } catch(e) {
            console.log('OPhim menu error:', e);
        }
    }

    // =========================================================================
    // Main component
    // =========================================================================
    Lampa.Component.add('ophim_main', function (object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({mask:true, over:true});
        var items   = [];
        var html    = $('<div class="category-full"></div>');
        var active  = 0;

        scroll.append(html);

        this.create = function () {
            this.activity.loader(true);

            var _this = this;

            var sections = [
                {slug:'phim-moi', title:'Phim Moi Cap Nhat'},
                {slug:'phim-bo', title:'Phim Bo'},
                {slug:'phim-le', title:'Phim Le'}
            ];

            var count = 0;

            sections.forEach(function(section) {
                var net = new Lampa.Reguest();
                net.timeout(10000);
                net.silent('https://ophim1.com/v1/api/danh-sach/' + section.slug + '?page=1&limit=12', function(json) {
                    var data = (json && json.data) || {};
                    var movieItems = data.items || [];

                    if (movieItems.length) {
                        var title = $('<div class="items-line__title" style="padding:0.5em 1em">' + section.title + '</div>');
                        html.append(title);

                        var line = $('<div class="items-line" style="display:flex;padding:0 0.5em"></div>');

                        movieItems.forEach(function(item) {
                            var imgSrc = item.thumb_url;
                            if (imgSrc && imgSrc.indexOf('http') !== 0) imgSrc = 'https://img.ophim.live/uploads/movies/' + imgSrc;

                            var card = Lampa.Template.get('card',{
                                title: item.name || '',
                                release_year: item.year || ''
                            });

                            card.find('.card__img').css('background-image','url(' + imgSrc + ')');

                            card.on('hover:enter', function() {
                                Lampa.Activity.push({
                                    url: '',
                                    title: item.name || 'Phim',
                                    component: 'ophim_view',
                                    slug: item.slug,
                                    page: 1
                                });
                            });

                            card.on('hover:focus', function() {
                                active = items.indexOf(card);
                                scroll.update(card, true);
                            });

                            line.append(card);
                            items.push(card);
                        });

                        html.append(line);
                    }

                    count++;
                    if (count >= sections.length) {
                        _this.activity.loader(false);
                        _this.activity.toggle();
                    }
                }, function() {
                    count++;
                    if (count >= sections.length) {
                        _this.activity.loader(false);
                        _this.activity.toggle();
                    }
                });
            });

            return this.render();
        };

        this.start = function () {
            Lampa.Controller.add('content',{
                toggle: function(){
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(items.length ? items[active] : false,scroll.render());
                },
                left: function(){
                    if(Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function(){
                    Navigator.move('right');
                },
                up: function(){
                    if(Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function(){
                    Navigator.move('down');
                },
                back: function(){
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause   = function(){};
        this.stop    = function(){};
        this.render  = function(){ return scroll.render(true); };
        this.destroy = function(){ network.clear(); scroll.destroy(); };
    });

    // =========================================================================
    // Detail + Episodes
    // =========================================================================
    Lampa.Component.add('ophim_view', function (object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({mask:true, over:true});
        var html    = $('<div></div>');
        var items   = [];
        var active  = 0;

        scroll.append(html);

        this.create = function () {
            this.activity.loader(true);

            var _this = this;
            var url = 'https://ophim1.com/v1/api/phim/' + object.slug;

            network.timeout(10000);
            network.silent(url, function(json) {
                _this.activity.loader(false);

                if (!json || !json.data || !json.data.item) {
                    var empty = new Lampa.Empty();
                    html.append(empty.render(true));
                    _this.start = empty.start;
                    _this.activity.toggle();
                    return;
                }

                var movie = json.data.item;
                var episodes = movie.episodes || [];

                // Info
                var info = '<div style="padding:1em">';
                info += '<div style="font-size:1.4em;color:#fff;font-weight:bold">' + (movie.name||'') + '</div>';
                if (movie.origin_name) info += '<div style="color:#aaa;font-style:italic;margin:0.2em 0">' + movie.origin_name + '</div>';

                var meta = [];
                if (movie.year) meta.push(movie.year);
                if (movie.quality) meta.push(movie.quality);
                if (movie.lang) meta.push(movie.lang);
                if (movie.episode_current) meta.push(movie.episode_current);
                if (meta.length) info += '<div style="color:#4fd1c5;margin:0.3em 0">' + meta.join(' | ') + '</div>';

                var desc = (movie.content||'').replace(/<[^>]*>/g,'');
                if (desc) info += '<div style="color:#999;margin-top:0.5em;font-size:0.85em;line-height:1.5">' + desc.substring(0,400) + '</div>';
                info += '</div>';

                html.append(info);

                // Episodes
                if (episodes.length) {
                    episodes.forEach(function(server) {
                        if (!server.server_data || !server.server_data.length) return;

                        html.append('<div style="color:#4fd1c5;padding:0.5em 1em;font-weight:bold">' + (server.server_name||'Server') + '</div>');

                        var wrap = $('<div style="padding:0 0.5em;display:flex;flex-wrap:wrap"></div>');

                        server.server_data.forEach(function(ep) {
                            var btn = $('<div class="selector" tabindex="0" style="margin:0.3em;padding:0.5em 1em;background:rgba(255,255,255,0.1);color:#fff;border-radius:0.3em;cursor:pointer">' + (ep.name||'?') + '</div>');

                            btn.on('hover:enter', function() {
                                var stream = ep.link_m3u8 || ep.link_embed || '';
                                if (!stream) { Lampa.Noty.show('No stream URL'); return; }

                                var saved = Lampa.Controller.enabled().name;
                                Lampa.Player.play({
                                    title: (movie.name||'') + ' - Tap ' + (ep.name||''),
                                    url: stream,
                                    quality: {}
                                });
                                Lampa.Player.playlist([{
                                    title: (movie.name||'') + ' - Tap ' + (ep.name||''),
                                    url: stream,
                                    quality: {}
                                }]);
                                Lampa.Player.callback(function(){ Lampa.Controller.toggle(saved); });
                            });

                            btn.on('hover:focus', function() {
                                active = items.indexOf(btn);
                                scroll.update(btn, true);
                                btn.css({background:'#4fd1c5', color:'#000'});
                            });
                            btn.on('hover:blur', function() {
                                btn.css({background:'rgba(255,255,255,0.1)', color:'#fff'});
                            });

                            wrap.append(btn);
                            items.push(btn);
                        });

                        html.append(wrap);
                    });
                }

                _this.activity.toggle();
            }, function() {
                _this.activity.loader(false);
                var empty = new Lampa.Empty();
                html.append(empty.render(true));
                _this.start = empty.start;
                _this.activity.toggle();
            });

            return this.render();
        };

        this.start = function(){
            Lampa.Controller.add('content',{
                toggle: function(){
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(items.length ? items[active] : false, scroll.render());
                },
                left: function(){
                    if(Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function(){ Navigator.move('right'); },
                up: function(){
                    if(Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function(){ Navigator.move('down'); },
                back: function(){ Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause   = function(){};
        this.stop    = function(){};
        this.render  = function(){ return scroll.render(true); };
        this.destroy = function(){ network.clear(); scroll.destroy(); };
    });

    // =========================================================================
    // Init
    // =========================================================================
    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
