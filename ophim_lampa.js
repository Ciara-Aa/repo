(function () {
    'use strict';

    var API_BASE = 'https://ophim1.com/v1/api';
    var IMG_BASE = 'https://img.ophim.live/uploads/movies/';
    var PLUGIN_NAME = 'OPhim';

    function imageUrl(path) {
        if (!path) return '';
        if (path.indexOf('http') === 0) return path;
        return IMG_BASE + path;
    }

    function stripHtml(html) {
        return (html || '').replace(/<[^>]*>/g, '');
    }

    // =========================================================================
    // COMPONENT: ophim_list
    // =========================================================================
    Lampa.Component.add('ophim_list', function (object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var body = $('<div class="category-full"></div>');
        var cards = [];
        var page = 1;
        var totalPages = 1;
        var active = 0;

        scroll.append(body);

        this.create = function () {};

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Background.immediately('');

            if (!cards.length) {
                this.activity.loader(true);
                load();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(cards.length ? cards[active] : false, scroll.render());
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
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.render = function () {
            return scroll.render(true);
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
        };

        function load() {
            var slug = object.slug || 'phim-moi';
            var urlType = object.url_type || 'list';
            var url;

            if (urlType === 'search') {
                url = API_BASE + '/tim-kiem?keyword=' + encodeURIComponent(object.search_query || '') + '&page=' + page + '&limit=24';
            } else if (urlType === 'category') {
                url = API_BASE + '/the-loai/' + slug + '?page=' + page + '&limit=24';
            } else if (urlType === 'country') {
                url = API_BASE + '/quoc-gia/' + slug + '?page=' + page + '&limit=24';
            } else {
                url = API_BASE + '/danh-sach/' + slug + '?page=' + page + '&limit=24';
            }

            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                var data = (json && json.data) || {};
                var items = data.items || [];

                Lampa.Activity.active().activity.loader(false);

                if (items.length) {
                    items.forEach(function (item) {
                        var card = Lampa.Template.get('card', {
                            title: item.name || '',
                            release_year: item.year || ''
                        });

                        var imgSrc = imageUrl(item.thumb_url);
                        card.find('.card__img').css('background-image', 'url(' + imgSrc + ')');

                        if (item.quality) {
                            var ql = card.find('.card__quality');
                            if (ql.length) ql.text(item.quality).show();
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
                            active = cards.indexOf(card);
                            scroll.update(card, true);
                            var bg = imageUrl(item.poster_url || item.thumb_url);
                            Lampa.Background.change(bg);
                        });

                        body.append(card);
                        cards.push(card);
                    });

                    Lampa.Controller.toggle('content');
                } else {
                    var empty = new Lampa.Empty();
                    scroll.append(empty.render());
                    Lampa.Controller.toggle('content');
                }
            }, function () {
                Lampa.Activity.active().activity.loader(false);
                var empty = new Lampa.Empty();
                scroll.append(empty.render());
                Lampa.Controller.toggle('content');
            });
        }
    });

    // =========================================================================
    // COMPONENT: ophim_view — chi tiết phim
    // =========================================================================
    Lampa.Component.add('ophim_view', function (object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var html = $('<div></div>');
        var focusItems = [];
        var active = 0;
        var loaded = false;

        scroll.append(html);

        this.create = function () {};

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!loaded) {
                this.activity.loader(true);
                fetchDetail();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(focusItems.length ? focusItems[active] : false, scroll.render());
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

        this.pause = function () {};
        this.stop = function () {};

        this.render = function () {
            return scroll.render(true);
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
        };

        function fetchDetail() {
            var url = API_BASE + '/phim/' + object.slug;
            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                Lampa.Activity.active().activity.loader(false);

                if (!json || !json.data) {
                    var empty = new Lampa.Empty();
                    scroll.append(empty.render());
                    Lampa.Controller.toggle('content');
                    return;
                }

                var movie = json.data.item || {};
                var episodes = movie.episodes || [];
                loaded = true;

                renderDetail(movie, episodes);
                Lampa.Controller.toggle('content');
            }, function () {
                Lampa.Activity.active().activity.loader(false);
                var empty = new Lampa.Empty();
                scroll.append(empty.render());
                Lampa.Controller.toggle('content');
            });
        }

        function renderDetail(movie, episodes) {
            var categories = (movie.category || []).map(function (c) { return c.name; }).join(', ');
            var countries = (movie.country || []).map(function (c) { return c.name; }).join(', ');
            var directors = Array.isArray(movie.director) ? movie.director.join(', ') : '';
            var actors = Array.isArray(movie.actor) ? movie.actor.join(', ') : '';
            var description = stripHtml(movie.content || '');

            Lampa.Background.change(imageUrl(movie.poster_url || movie.thumb_url));

            var info = '<div style="padding:1.5em 1em">';
            info += '<div style="font-size:1.6em;color:#fff;font-weight:bold;margin-bottom:0.2em">' + (movie.name || '') + '</div>';
            if (movie.origin_name) info += '<div style="color:#aaa;font-style:italic;margin-bottom:0.4em">' + movie.origin_name + '</div>';

            var meta = [];
            if (movie.year) meta.push(movie.year);
            if (movie.quality) meta.push(movie.quality);
            if (movie.lang) meta.push(movie.lang);
            if (movie.time) meta.push(movie.time);
            if (movie.episode_current) meta.push(movie.episode_current);
            if (meta.length) info += '<div style="color:#4fd1c5;margin-bottom:0.6em">' + meta.join(' &bull; ') + '</div>';

            if (categories) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff">Thể loại:</span> ' + categories + '</div>';
            if (countries) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff">Quốc gia:</span> ' + countries + '</div>';
            if (directors) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff">Đạo diễn:</span> ' + directors + '</div>';
            if (actors) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff">Diễn viên:</span> ' + actors + '</div>';

            if (description) info += '<div style="color:#999;margin-top:0.6em;line-height:1.5;font-size:0.85em">' + description.substring(0, 600) + '</div>';
            info += '</div>';

            html.append(info);

            if (episodes && episodes.length) {
                episodes.forEach(function (server) {
                    if (!server.server_data || !server.server_data.length) return;

                    html.append('<div style="color:#4fd1c5;font-size:1.1em;padding:0.5em 1em;font-weight:bold">' + (server.server_name || 'Server') + '</div>');

                    var epWrap = $('<div style="padding:0 0.5em;display:flex;flex-wrap:wrap"></div>');

                    server.server_data.forEach(function (ep) {
                        var epBtn = $('<div class="selector" tabindex="0" style="display:inline-block;margin:0.3em;padding:0.5em 1em;background:rgba(255,255,255,0.08);color:#fff;border-radius:0.4em;font-size:0.9em;cursor:pointer">' + (ep.name || '?') + '</div>');

                        epBtn.on('hover:enter', function () {
                            playEpisode(ep, movie);
                        });

                        epBtn.on('hover:focus', function () {
                            active = focusItems.indexOf(epBtn);
                            scroll.update(epBtn, true);
                            epBtn.css('background', '#4fd1c5');
                            epBtn.css('color', '#000');
                        });

                        epBtn.on('hover:blur', function () {
                            epBtn.css('background', 'rgba(255,255,255,0.08)');
                            epBtn.css('color', '#fff');
                        });

                        epWrap.append(epBtn);
                        focusItems.push(epBtn);
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
                title: (movie.name || '') + ' - Tập ' + (ep.name || ''),
                url: streamUrl,
                quality: {},
                timeline: {
                    title: movie.name || '',
                    img: imageUrl(movie.thumb_url)
                }
            });

            Lampa.Player.playlist([{
                title: (movie.name || '') + ' - Tập ' + (ep.name || ''),
                url: streamUrl,
                quality: {}
            }]);
        }
    });

    // =========================================================================
    // COMPONENT: ophim_main — Trang chủ
    // =========================================================================
    Lampa.Component.add('ophim_main', function (object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var html = $('<div></div>');
        var allItems = [];
        var active = 0;
        var loaded = false;

        var sections = [
            { slug: 'phim-moi', title: 'Phim Mới Cập Nhật' },
            { slug: 'phim-bo', title: 'Phim Bộ' },
            { slug: 'phim-le', title: 'Phim Lẻ' },
            { slug: 'phim-chieu-rap', title: 'Phim Chiếu Rạp' },
            { slug: 'hoat-hinh', title: 'Hoạt Hình' },
            { slug: 'tv-shows', title: 'TV Shows' }
        ];

        scroll.append(html);

        this.create = function () {};

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!loaded) {
                this.activity.loader(true);
                loadSections();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(allItems.length ? allItems[active] : false, scroll.render());
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

        this.pause = function () {};
        this.stop = function () {};

        this.render = function () {
            return scroll.render(true);
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
        };

        function loadSections() {
            var count = 0;

            sections.forEach(function (section) {
                var net = new Lampa.Reguest();
                var url = API_BASE + '/danh-sach/' + section.slug + '?page=1&limit=12';

                net.timeout(15000);
                net.silent(url, function (json) {
                    var data = (json && json.data) || {};
                    var items = data.items || [];

                    if (items.length) {
                        var titleEl = $('<div class="items-line__title selector" tabindex="0" style="padding:0.8em 1em 0.3em;cursor:pointer">' + section.title + ' ›</div>');

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
                            active = allItems.indexOf(titleEl);
                            scroll.update(titleEl, true);
                        });

                        html.append(titleEl);
                        allItems.push(titleEl);

                        var line = $('<div class="items-line" style="display:flex;overflow:hidden;padding:0 0.5em 0.5em"></div>');

                        items.forEach(function (item) {
                            var card = Lampa.Template.get('card', {
                                title: item.name || '',
                                release_year: item.year || ''
                            });

                            card.find('.card__img').css('background-image', 'url(' + imageUrl(item.thumb_url) + ')');

                            if (item.quality) {
                                var ql = card.find('.card__quality');
                                if (ql.length) ql.text(item.quality).show();
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
                                active = allItems.indexOf(card);
                                scroll.update(card, true);
                                Lampa.Background.change(imageUrl(item.poster_url || item.thumb_url));
                            });

                            line.append(card);
                            allItems.push(card);
                        });

                        html.append(line);
                    }

                    count++;
                    if (count >= sections.length) {
                        loaded = true;
                        Lampa.Activity.active().activity.loader(false);
                        Lampa.Controller.toggle('content');
                    }
                }, function () {
                    count++;
                    if (count >= sections.length) {
                        loaded = true;
                        Lampa.Activity.active().activity.loader(false);
                        Lampa.Controller.toggle('content');
                    }
                });
            });
        }
    });

    // =========================================================================
    // MENU
    // =========================================================================
    function addMenuButton() {
        var ico = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm2 2l6 4-6 4V8z"/></svg>';

        var item = $('<li class="menu__item selector" data-action="ophim">\
            <div class="menu__ico">' + ico + '</div>\
            <div class="menu__text">' + PLUGIN_NAME + '</div>\
        </li>');

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: PLUGIN_NAME,
                component: 'ophim_main',
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(item);
    }

    // =========================================================================
    // BOOTSTRAP
    // =========================================================================
    if (window.appready) {
        addMenuButton();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                addMenuButton();
            }
        });
    }

})();
