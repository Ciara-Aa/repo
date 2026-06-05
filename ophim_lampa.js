// =============================================================================
// Lampa Plugin — OPhim Việt (Xem Phim Việt)
// Nguồn phim: ophim1.com API
// Version: 1.1.0
// =============================================================================

(function () {
    'use strict';

    var API_BASE     = 'https://ophim1.com/v1/api';
    var IMG_BASE     = 'https://img.ophim.live/uploads/movies/';
    var PLUGIN_NAME  = 'OPhim Việt';

    function imageUrl(path) {
        if (!path) return '';
        if (path.indexOf('http') === 0) return path;
        return IMG_BASE + path;
    }

    function stripHtml(html) {
        return (html || '').replace(/<[^>]*>/g, '');
    }

    // =========================================================================
    // TEMPLATE
    // =========================================================================

    Lampa.Template.add('ophim_style', '<style>\
    .ophim-card-ep { display: inline-block; margin: 0.3em; padding: 0.5em 1em; background: rgba(255,255,255,0.08); color: #fff; border-radius: 0.4em; cursor: pointer; font-size: 0.9em; }\
    .ophim-card-ep.focus, .ophim-card-ep:hover { background: #4fd1c5; color: #000; }\
    .ophim-server-name { color: #4fd1c5; font-size: 1.1em; padding: 0.5em 0 0.2em; }\
    .ophim-info-line { color: #aaa; font-size: 0.85em; margin-bottom: 0.2em; }\
    .ophim-info-line b { color: #ddd; }\
    </style>');

    // =========================================================================
    // COMPONENT: ophim_list — Danh sách phim
    // =========================================================================

    Lampa.Component.add('ophim_list', function (object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({mask: true, over: true});
        var items   = [];
        var html    = $('<div></div>');
        var body    = $('<div class="category-full"></div>');
        var active  = 0;
        var page    = object.page || 1;
        var totalPages = 1;

        this.create = function () {
            this.activity.loader(true);

            html.append(body);
            scroll.append(html);

            this.loading();
        };

        this.loading = function () {
            var _this = this;
            var url   = buildUrl();

            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                _this.activity.loader(false);

                var data       = (json && json.data) || {};
                var movieItems = data.items || [];
                var params     = data.params || {};
                var pagination = params.pagination || {};

                totalPages = Math.ceil((pagination.totalItems || 0) / (pagination.totalItemsPerPage || 24)) || 1;

                if (movieItems.length) {
                    movieItems.forEach(function (item) {
                        var card = Lampa.Template.get('card', {
                            title: item.name || '',
                            release_year: item.year || ''
                        });

                        var imgSrc = imageUrl(item.thumb_url);

                        card.find('.card__img').css('background-image', 'url(' + imgSrc + ')');

                        // quality badge
                        if (item.quality) {
                            card.find('.card__quality').text(item.quality).show();
                        }

                        card.on('hover:enter', function () {
                            Lampa.Activity.push({
                                url: '',
                                title: item.name || 'Phim',
                                component: 'ophim_view',
                                slug: item.slug,
                                page: 1
                            });
                        });

                        body.append(card);
                        items.push(card);
                    });
                } else if (page === 1) {
                    _this.empty();
                }

                _this.activity.toggle();
            }, function () {
                _this.activity.loader(false);
                _this.empty();
            });
        };

        function buildUrl() {
            var urlType = object.url_type || 'list';
            var slug    = object.slug || 'phim-moi';
            var limit   = 24;

            if (urlType === 'search') {
                return API_BASE + '/tim-kiem?keyword=' + encodeURIComponent(object.search_query || '') + '&page=' + page + '&limit=' + limit;
            }
            if (urlType === 'category') {
                return API_BASE + '/the-loai/' + slug + '?page=' + page + '&limit=' + limit;
            }
            if (urlType === 'country') {
                return API_BASE + '/quoc-gia/' + slug + '?page=' + page + '&limit=' + limit;
            }
            return API_BASE + '/danh-sach/' + slug + '?page=' + page + '&limit=' + limit;
        }

        this.empty = function () {
            var empty = new Lampa.Empty();
            html.append(empty.render());
            this.start = empty.start;
            this.activity.toggle();
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(items.length ? items[0] : false, scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    Navigator.move('right');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                    else if (page < totalPages) {
                        page++;
                        this.loading();
                    }
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop  = function () {};

        this.render = function () {
            return scroll.render(true);
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
        };
    });

    // =========================================================================
    // COMPONENT: ophim_view — Chi tiết phim + danh sách tập
    // =========================================================================

    Lampa.Component.add('ophim_view', function (object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({mask: true, over: true});
        var html    = $('<div class="ophim-view"></div>');
        var focusable = [];

        this.create = function () {
            this.activity.loader(true);

            scroll.append(html);
            fetchDetail();
        };

        var _this = this;

        function fetchDetail() {
            var url = API_BASE + '/phim/' + object.slug;

            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                _this.activity.loader(false);

                if (!json || !json.data) {
                    _this.empty();
                    return;
                }

                var movie    = json.data.item || {};
                var episodes = movie.episodes || [];

                renderDetail(movie, episodes);
                _this.activity.toggle();
            }, function () {
                _this.activity.loader(false);
                _this.empty();
            });
        }

        function renderDetail(movie, episodes) {
            var categories = (movie.category || []).map(function(c) { return c.name; }).join(', ');
            var countries  = (movie.country  || []).map(function(c) { return c.name; }).join(', ');
            var directors  = Array.isArray(movie.director) ? movie.director.join(', ') : '';
            var actors     = Array.isArray(movie.actor) ? movie.actor.join(', ') : '';
            var description = stripHtml(movie.content || '');

            var info = '<div style="padding:1em">';
            info += '<div style="font-size:1.4em;color:#fff;font-weight:700;margin-bottom:0.3em">' + (movie.name || '') + '</div>';
            if (movie.origin_name) info += '<div style="color:#999;font-style:italic;margin-bottom:0.5em">' + movie.origin_name + '</div>';

            var meta = [];
            if (movie.year)    meta.push(movie.year);
            if (movie.quality) meta.push(movie.quality);
            if (movie.lang)    meta.push(movie.lang);
            if (movie.time)    meta.push(movie.time);
            if (movie.episode_current) meta.push(movie.episode_current);
            if (meta.length) info += '<div style="color:#4fd1c5;margin-bottom:0.5em">' + meta.join(' • ') + '</div>';

            if (categories) info += '<div class="ophim-info-line"><b>Thể loại:</b> ' + categories + '</div>';
            if (countries)  info += '<div class="ophim-info-line"><b>Quốc gia:</b> ' + countries + '</div>';
            if (directors)  info += '<div class="ophim-info-line"><b>Đạo diễn:</b> ' + directors + '</div>';
            if (actors)     info += '<div class="ophim-info-line"><b>Diễn viên:</b> ' + actors + '</div>';

            if (description) info += '<div style="color:#999;margin-top:0.6em;line-height:1.5;font-size:0.85em">' + description.substring(0, 500) + '</div>';
            info += '</div>';

            html.append(info);

            // episodes
            if (episodes && episodes.length) {
                episodes.forEach(function (server) {
                    if (!server.server_data || !server.server_data.length) return;

                    html.append('<div class="ophim-server-name">' + (server.server_name || 'Server') + '</div>');

                    var epWrap = $('<div style="padding:0.3em"></div>');

                    server.server_data.forEach(function (ep) {
                        var epBtn = $('<div class="ophim-card-ep selector" tabindex="0">' + (ep.name || '?') + '</div>');

                        epBtn.on('hover:enter', function () {
                            playEpisode(ep, movie);
                        });

                        epBtn.on('hover:focus', function () {
                            scroll.update(epBtn, true);
                        });

                        epWrap.append(epBtn);
                        focusable.push(epBtn);
                    });

                    html.append(epWrap);
                });
            }
        }

        function playEpisode(ep, movie) {
            var streamUrl = ep.link_m3u8 || ep.link_embed || '';

            if (!streamUrl) {
                Lampa.Noty.show('Không tìm thấy link phát');
                return;
            }

            Lampa.Player.play({
                title:  (movie.name || '') + ' - ' + (ep.name || ''),
                url:    streamUrl,
                quality: {},
                timeline: {
                    title: movie.name || '',
                    img: imageUrl(movie.thumb_url)
                }
            });

            Lampa.Player.playlist([{
                title: (movie.name || '') + ' - ' + (ep.name || ''),
                url:   streamUrl,
                quality: {}
            }]);
        }

        this.empty = function () {
            var empty = new Lampa.Empty();
            html.append(empty.render());
            this.start = empty.start;
            this.activity.toggle();
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(focusable.length ? focusable[0] : false, scroll.render());
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause   = function () {};
        this.stop    = function () {};
        this.render  = function () { return scroll.render(true); };
        this.destroy = function () { network.clear(); scroll.destroy(); };
    });

    // =========================================================================
    // COMPONENT: ophim_main — Trang chủ
    // =========================================================================

    Lampa.Component.add('ophim_main', function (object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({mask: true, over: true});
        var html    = $('<div></div>');
        var allItems = [];

        var sections = [
            { slug: 'phim-moi',       title: 'Phim Mới Cập Nhật' },
            { slug: 'phim-bo',        title: 'Phim Bộ' },
            { slug: 'phim-le',        title: 'Phim Lẻ' },
            { slug: 'phim-chieu-rap', title: 'Phim Chiếu Rạp' },
            { slug: 'hoat-hinh',      title: 'Hoạt Hình' },
            { slug: 'tv-shows',       title: 'TV Shows' }
        ];

        this.create = function () {
            this.activity.loader(true);

            scroll.append(html);

            var _this = this;
            var loaded = 0;

            sections.forEach(function (section) {
                loadSection(section, function () {
                    loaded++;
                    if (loaded >= sections.length) {
                        _this.activity.loader(false);
                        _this.activity.toggle();
                    }
                });
            });
        };

        function loadSection(section, callback) {
            var url = API_BASE + '/danh-sach/' + section.slug + '?page=1&limit=12';
            var net = new Lampa.Reguest();

            net.timeout(15000);
            net.silent(url, function (json) {
                var data  = (json && json.data) || {};
                var items = data.items || [];

                if (items.length) {
                    // Section title
                    var titleEl = $('<div class="items-line__title" style="padding:0.8em 1em 0.2em;cursor:pointer">' + section.title + ' ›</div>');
                    titleEl.addClass('selector');

                    titleEl.on('hover:enter', function () {
                        Lampa.Activity.push({
                            url: '',
                            title: section.title,
                            component: 'ophim_list',
                            slug: section.slug,
                            url_type: 'list',
                            page: 1
                        });
                    });

                    titleEl.on('hover:focus', function () {
                        scroll.update(titleEl, true);
                    });

                    html.append(titleEl);
                    allItems.push(titleEl);

                    // Cards row
                    var line = $('<div class="items-line" style="display:flex;flex-wrap:nowrap;overflow:hidden;padding:0.5em"></div>');

                    items.forEach(function (item) {
                        var card = Lampa.Template.get('card', {
                            title: item.name || '',
                            release_year: item.year || ''
                        });

                        card.find('.card__img').css('background-image', 'url(' + imageUrl(item.thumb_url) + ')');

                        if (item.quality) {
                            card.find('.card__quality').text(item.quality).show();
                        }

                        card.on('hover:enter', function () {
                            Lampa.Activity.push({
                                url: '',
                                title: item.name || 'Phim',
                                component: 'ophim_view',
                                slug: item.slug,
                                page: 1
                            });
                        });

                        card.on('hover:focus', function () {
                            scroll.update(card, true);
                        });

                        line.append(card);
                        allItems.push(card);
                    });

                    html.append(line);
                }

                callback();
            }, function () {
                callback();
            });
        }

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(allItems.length ? allItems[0] : false, scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    Navigator.move('right');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause   = function () {};
        this.stop    = function () {};
        this.render  = function () { return scroll.render(true); };
        this.destroy = function () { network.clear(); scroll.destroy(); };
    });

    // =========================================================================
    // MENU ITEM
    // =========================================================================

    function addMenuItem() {
        var ico = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm2 2l6 4-6 4V8z"/></svg>';

        var menuItem = $('<li class="menu__item selector" data-action="ophim_main">\
            <div class="menu__ico">' + ico + '</div>\
            <div class="menu__text">' + PLUGIN_NAME + '</div>\
        </li>');

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: PLUGIN_NAME,
                component: 'ophim_main',
                page: 1
            });
        });

        // Insert into menu
        $('.menu .menu__list').eq(0).append(menuItem);
    }

    // =========================================================================
    // INJECT STYLES
    // =========================================================================

    function addStyles() {
        $('body').append(Lampa.Template.get('ophim_style', {}, true));
    }

    // =========================================================================
    // INIT
    // =========================================================================

    function startPlugin() {
        addStyles();
        addMenuItem();
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                startPlugin();
            }
        });
    }

})();
