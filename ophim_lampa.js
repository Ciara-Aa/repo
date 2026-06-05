(function () {
    'use strict';

    var API_BASE = 'https://ophim1.com/v1/api';
    var IMG_BASE = 'https://img.ophim.live/uploads/movies/';

    function imageUrl(path) {
        if (!path) return '';
        if (path.indexOf('http') === 0) return path;
        return IMG_BASE + path;
    }

    function stripHtml(html) {
        return (html || '').replace(/<[^>]*>/g, '');
    }

    function fixCards(items) {
        items.forEach(function (item) {
            item.title = item.name || '';
            item.name = item.name || '';
            item.original_title = item.origin_name || '';
            item.img = imageUrl(item.thumb_url);
            item.background_image = imageUrl(item.poster_url || item.thumb_url);
            item.poster = imageUrl(item.poster_url || item.thumb_url);
            item.release_year = item.year || '';
            if (item.quality) item.quality = item.quality;
            if (item.episode_current) item.episode = item.episode_current;
        });
    }

    // =========================================================================
    // Trang chủ - Main component (dùng InteractionMain)
    // =========================================================================
    function OPhimMain(object) {
        var comp = new Lampa.InteractionMain(object);

        comp.create = function () {
            this.activity.loader(true);
            loadMain(this);
            return this.render();
        };

        comp.onMore = function (data) {
            Lampa.Activity.push({
                url: data.url,
                title: data.title,
                component: 'ophim_category',
                page: 2
            });
        };

        function loadMain(that) {
            var sections = [
                { slug: 'phim-moi',       title: 'Phim Mới Cập Nhật' },
                { slug: 'phim-bo',        title: 'Phim Bộ' },
                { slug: 'phim-le',        title: 'Phim Lẻ' },
                { slug: 'phim-chieu-rap', title: 'Phim Chiếu Rạp' },
                { slug: 'hoat-hinh',      title: 'Hoạt Hình' },
                { slug: 'tv-shows',       title: 'TV Shows' }
            ];

            var status = new Lampa.Status(sections.length);

            status.onComplite = function (data) {
                var items = [];
                sections.forEach(function (section) {
                    if (data[section.slug] && data[section.slug].results.length) {
                        items.push(data[section.slug]);
                    }
                });
                if (items.length) that.build(items);
                else that.empty();
            };

            sections.forEach(function (section) {
                var url = API_BASE + '/danh-sach/' + section.slug + '?page=1&limit=12';
                var network = new Lampa.Reguest();
                network.timeout(15000);
                network.silent(url, function (json) {
                    var data = (json && json.data) || {};
                    var items = data.items || [];

                    if (items.length) {
                        fixCards(items);
                        status.append(section.slug, {
                            title: section.title,
                            results: items,
                            url: section.slug,
                            collection: true,
                            line_type: 'cards',
                            card_events: {
                                onEnter: function (card, element) {
                                    Lampa.Activity.push({
                                        url: '',
                                        title: element.name || 'Phim',
                                        component: 'ophim_detail',
                                        slug: element.slug,
                                        page: 1
                                    });
                                }
                            }
                        });
                    } else {
                        status.error();
                    }
                }, function () {
                    status.error();
                });
            });
        }

        return comp;
    }

    // =========================================================================
    // Danh sách phim - Category component (dùng InteractionCategory)
    // =========================================================================
    function OPhimCategory(object) {
        var comp = new Lampa.InteractionCategory(object);
        var slug = object.url || object.slug || 'phim-moi';
        var urlType = object.url_type || 'list';

        comp.create = function () {
            this.activity.loader(true);

            var params = {
                url: slug,
                page: object.page || 1
            };

            loadList(params, this.build.bind(this), this.empty.bind(this));

            return this.render();
        };

        comp.nextPageReuest = function (obj, resolve, reject) {
            var params = {
                url: slug,
                page: obj.page || 1
            };

            loadList(params, resolve, reject);
        };

        comp.cardRender = function (object, element, card) {
            card.onEnter = function () {
                Lampa.Activity.push({
                    url: '',
                    title: element.name || 'Phim',
                    component: 'ophim_detail',
                    slug: element.slug,
                    page: 1
                });
            };
        };

        function loadList(params, success, error) {
            var url;

            if (urlType === 'search') {
                url = API_BASE + '/tim-kiem?keyword=' + encodeURIComponent(object.search_query || '') + '&page=' + params.page + '&limit=24';
            } else if (urlType === 'category') {
                url = API_BASE + '/the-loai/' + params.url + '?page=' + params.page + '&limit=24';
            } else if (urlType === 'country') {
                url = API_BASE + '/quoc-gia/' + params.url + '?page=' + params.page + '&limit=24';
            } else {
                url = API_BASE + '/danh-sach/' + params.url + '?page=' + params.page + '&limit=24';
            }

            var network = new Lampa.Reguest();
            network.timeout(15000);
            network.silent(url, function (json) {
                var data = (json && json.data) || {};
                var items = data.items || [];
                var pagination = (data.params && data.params.pagination) || {};
                var totalItems = pagination.totalItems || 0;
                var totalPages = Math.ceil(totalItems / 24) || 1;

                if (items.length) {
                    fixCards(items);
                    success({
                        results: items,
                        total_pages: totalPages,
                        collection: true
                    });
                } else {
                    error();
                }
            }, function () {
                error();
            });
        }

        return comp;
    }

    // =========================================================================
    // Chi tiết phim
    // =========================================================================
    function OPhimDetail(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var html = $('<div></div>');
        var focusable = [];
        var active = 0;
        var loaded = false;

        scroll.append(html);

        this.create = function () {};

        this.start = function () {
            var _this = this;

            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!loaded) {
                this.activity.loader(true);
                fetchDetail(_this);
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(focusable.length ? focusable[active] : false, scroll.render());
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
        this.render = function () { return scroll.render(true); };
        this.destroy = function () { network.clear(); scroll.destroy(); };

        function fetchDetail(_this) {
            var url = API_BASE + '/phim/' + object.slug;
            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                _this.activity.loader(false);

                if (!json || !json.data) {
                    var empty = new Lampa.Empty();
                    html.append(empty.render(true));
                    _this.start = empty.start;
                    _this.activity.toggle();
                    return;
                }

                var movie = json.data.item || {};
                var episodes = movie.episodes || [];
                loaded = true;

                renderDetail(movie, episodes);
                _this.activity.toggle();
            }, function () {
                _this.activity.loader(false);
                var empty = new Lampa.Empty();
                html.append(empty.render(true));
                _this.start = empty.start;
                _this.activity.toggle();
            });
        }

        function renderDetail(movie, episodes) {
            Lampa.Background.change(imageUrl(movie.poster_url || movie.thumb_url));

            var categories = (movie.category || []).map(function (c) { return c.name; }).join(', ');
            var countries = (movie.country || []).map(function (c) { return c.name; }).join(', ');
            var directors = Array.isArray(movie.director) ? movie.director.join(', ') : '';
            var actors = Array.isArray(movie.actor) ? movie.actor.join(', ') : '';
            var description = stripHtml(movie.content || '');

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

            if (categories) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff;font-weight:bold">Thể loại:</span> ' + categories + '</div>';
            if (countries) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff;font-weight:bold">Quốc gia:</span> ' + countries + '</div>';
            if (directors) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff;font-weight:bold">Đạo diễn:</span> ' + directors + '</div>';
            if (actors) info += '<div style="color:#ccc;font-size:0.85em;margin-bottom:0.15em"><span style="color:#fff;font-weight:bold">Diễn viên:</span> ' + actors + '</div>';

            if (description) info += '<div style="color:#999;margin-top:0.6em;line-height:1.5;font-size:0.85em">' + description.substring(0, 600) + '</div>';
            info += '</div>';

            html.append(info);

            // Episodes
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
                            active = focusable.indexOf(epBtn);
                            scroll.update(epBtn, true);
                            epBtn.css({ background: '#4fd1c5', color: '#000' });
                        });

                        epBtn.on('hover:blur', function () {
                            epBtn.css({ background: 'rgba(255,255,255,0.08)', color: '#fff' });
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

            var controller_enabled = Lampa.Controller.enabled().name;

            var video = {
                title: (movie.name || '') + ' - Tập ' + (ep.name || ''),
                url: streamUrl,
                quality: {}
            };

            Lampa.Player.play(video);
            Lampa.Player.playlist([video]);
            Lampa.Player.callback(function () {
                Lampa.Controller.toggle(controller_enabled);
            });
        }
    }

    // =========================================================================
    // Đăng ký Components + Menu
    // =========================================================================
    function startPlugin() {
        Lampa.Component.add('ophim_main', OPhimMain);
        Lampa.Component.add('ophim_category', OPhimCategory);
        Lampa.Component.add('ophim_detail', OPhimDetail);

        // Thêm menu
        var button = $('<li class="menu__item selector">\
            <div class="menu__ico">\
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">\
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm2 2l6 4-6 4V8z"/>\
                </svg>\
            </div>\
            <div class="menu__text">OPhim</div>\
        </li>');

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'OPhim Việt',
                component: 'ophim_main',
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(button);
    }

    // =========================================================================
    // Bootstrap
    // =========================================================================
    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
