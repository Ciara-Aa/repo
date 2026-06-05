// =============================================================================
// Lampa Plugin — OPhim Source (Xem Phim Việt)
// Nguồn phim: ophim1.com API
// Version: 1.0.0
// =============================================================================

(function () {
    'use strict';

    // =========================================================================
    // CONFIG
    // =========================================================================
    var PLUGIN_NAME  = 'OPhim Việt';
    var PLUGIN_ID    = 'ophim_viet';
    var API_BASE     = 'https://ophim1.com/v1/api';
    var IMG_BASE     = 'https://img.ophim.live/uploads/movies/';
    var ITEMS_PER_PAGE = 24;

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Build full image URL from a relative path
     */
    function imageUrl(path) {
        if (!path) return '';
        if (path.indexOf('http') === 0) return path;
        return IMG_BASE + path;
    }

    /**
     * Strip HTML tags from a string
     */
    function stripHtml(html) {
        return (html || '').replace(/<[^>]*>/g, '');
    }

    /**
     * Map raw OPhim item → Lampa card object
     */
    function mapItem(item) {
        return {
            id:          item.slug,
            title:       item.name || '',
            original_title: item.origin_name || '',
            img:         imageUrl(item.thumb_url),
            background:  imageUrl(item.poster_url),
            year:        item.year || 0,
            quality:     item.quality || '',
            episode:     item.episode_current || '',
            lang:        item.lang || '',
            type:        item.type === 'single' ? 'movie' : 'tv',
            ophim_slug:  item.slug  // keep for detail fetch
        };
    }

    // =========================================================================
    // NETWORK LAYER
    // =========================================================================

    /**
     * Simple GET JSON using Lampa.Reguest
     */
    function apiGet(url, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(15000);
        network.silent(url, function (json) {
            onSuccess(json);
        }, function (a, c) {
            Lampa.Noty.show('OPhim: Lỗi tải dữ liệu');
            if (onError) onError(a, c);
        });
    }

    // =========================================================================
    // COMPONENT: OPhim Catalog (danh sách phim)
    // =========================================================================

    function OPhimCatalog(object) {
        var comp   = new Lampa.InteractionCategory(object);
        var scroll = comp.scroll;
        var body   = null;
        var network = new Lampa.Reguest();
        var page   = 1;
        var total_pages = 1;
        var loading = false;
        var slug   = object.slug || 'phim-moi';
        var url_type = object.url_type || 'list'; // 'list', 'search', 'category', 'country'

        /**
         * Build the API URL based on type
         */
        function buildUrl() {
            if (url_type === 'search') {
                return API_BASE + '/tim-kiem?keyword=' + encodeURIComponent(object.search_query || '') + '&page=' + page + '&limit=' + ITEMS_PER_PAGE;
            }
            if (url_type === 'category') {
                return API_BASE + '/the-loai/' + slug + '?page=' + page + '&limit=' + ITEMS_PER_PAGE;
            }
            if (url_type === 'country') {
                return API_BASE + '/quoc-gia/' + slug + '?page=' + page + '&limit=' + ITEMS_PER_PAGE;
            }
            if (url_type === 'year') {
                return API_BASE + '/nam-phat-hanh/' + slug + '?page=' + page + '&limit=' + ITEMS_PER_PAGE;
            }
            // default: list
            return API_BASE + '/danh-sach/' + slug + '?page=' + page + '&limit=' + ITEMS_PER_PAGE;
        }

        /**
         * Load one page of results
         */
        function loadPage() {
            if (loading) return;
            loading = true;
            comp.activity.loader(true);

            var url = buildUrl();
            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                loading = false;
                comp.activity.loader(false);

                var data = (json && json.data) || {};
                var items = data.items || [];
                var pagination = (data.params && data.params.pagination) || {};

                total_pages = Math.ceil((pagination.totalItems || 0) / (pagination.totalItemsPerPage || ITEMS_PER_PAGE)) || 1;

                if (items.length) {
                    items.forEach(function (item) {
                        var card = mapItem(item);
                        comp.append(cardElement(card));
                    });

                    comp.activity.toggle();
                } else if (page === 1) {
                    comp.empty('Không tìm thấy phim');
                }
            }, function () {
                loading = false;
                comp.activity.loader(false);
                if (page === 1) comp.empty('Lỗi kết nối');
            });
        }

        /**
         * Create a clickable card element for a movie
         */
        function cardElement(card) {
            var element = Lampa.Template.get('card', {
                title:       card.title,
                release_year: card.year || '',
                quality:     card.quality
            });

            var img = element.find('.card__img')[0] || element.find('img')[0];
            if (img) {
                if (img.tagName === 'IMG') {
                    img.src = card.img;
                } else {
                    img.style.backgroundImage = 'url(' + card.img + ')';
                }
            }

            // Episode badge
            if (card.episode) {
                var info = element.find('.card__info');
                if (info.length) {
                    info.text(card.episode);
                }
            }

            element.on('hover:enter', function () {
                openDetail(card);
            });

            element.on('hover:focus', function () {
                scroll.update(element, true);
            });

            return element;
        }

        /**
         * Open movie detail page
         */
        function openDetail(card) {
            Lampa.Activity.push({
                url:       '',
                title:     card.title,
                component: 'ophim_detail',
                slug:      card.ophim_slug || card.id,
                movie:     card,
                page:      1
            });
        }

        comp.create = function () {
            // Title
            comp.activity.title(object.title || PLUGIN_NAME);

            // Load first page
            loadPage();

            // Infinite scroll
            comp.onMore = function () {
                if (page < total_pages) {
                    page++;
                    loadPage();
                }
            };

            return comp.render();
        };

        comp.start  = comp.create;
        comp.pause  = function () {};
        comp.stop   = function () {};
        comp.render = function () { return comp.render(); };

        comp.destroy = function () {
            network.clear();
        };

        return comp;
    }

    // =========================================================================
    // COMPONENT: OPhim Detail (chi tiết phim)
    // =========================================================================

    function OPhimDetail(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var html    = $('<div class="ophim-detail"></div>');
        var loaded  = false;

        this.create = function () {
            this.activity.loader(true);
            fetchDetail(object.slug);
            return this.render();
        };

        this.start = this.create;

        this.render = function () {
            return scroll.render(true);
        };

        this.pause  = function () {};
        this.stop   = function () {};
        this.destroy = function () {
            network.clear();
            scroll.destroy();
        };

        var self = this;

        function fetchDetail(slug) {
            var url = API_BASE + '/phim/' + slug;
            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                self.activity.loader(false);

                if (!json || !json.data) {
                    Lampa.Noty.show('Không tìm thấy phim');
                    return;
                }

                var movie    = json.data.item || json.movie || {};
                var episodes = json.data.item ? json.data.item.episodes : (json.episodes || []);

                renderDetail(movie, episodes);
                loaded = true;
            }, function () {
                self.activity.loader(false);
                Lampa.Noty.show('OPhim: Lỗi tải chi tiết phim');
            });
        }

        function renderDetail(movie, episodes) {
            // ---- Info section ----
            var categories = (movie.category || []).map(function (c) { return c.name; }).join(', ');
            var countries  = (movie.country  || []).map(function (c) { return c.name; }).join(', ');
            var directors  = Array.isArray(movie.director) ? movie.director.join(', ') : (movie.director || '');
            var actors     = Array.isArray(movie.actor)    ? movie.actor.join(', ')    : (movie.actor || '');
            var description = stripHtml(movie.content || '');
            var rating = 0;
            if (movie.tmdb && movie.tmdb.vote_average) rating = movie.tmdb.vote_average;

            // Update activity title
            self.activity.title(movie.name || object.title || '');

            // Build detail HTML
            var detailHtml = '<div class="ophim-detail-wrap">';
            detailHtml += '<div class="ophim-detail-poster">';
            detailHtml += '<img src="' + imageUrl(movie.poster_url || movie.thumb_url) + '" alt="' + (movie.name || '') + '" />';
            detailHtml += '</div>';
            detailHtml += '<div class="ophim-detail-info">';
            detailHtml += '<div class="ophim-detail-title">' + (movie.name || '') + '</div>';
            if (movie.origin_name) {
                detailHtml += '<div class="ophim-detail-origin">' + movie.origin_name + '</div>';
            }

            // Meta info
            var metaItems = [];
            if (movie.year)    metaItems.push('📅 ' + movie.year);
            if (movie.quality) metaItems.push('🎬 ' + movie.quality);
            if (movie.lang)    metaItems.push('🌐 ' + movie.lang);
            if (movie.time)    metaItems.push('⏱ ' + movie.time);
            if (movie.episode_current) metaItems.push('📺 ' + movie.episode_current);
            if (rating)        metaItems.push('⭐ ' + rating.toFixed(1));

            if (metaItems.length) {
                detailHtml += '<div class="ophim-detail-meta">' + metaItems.join(' &nbsp;|&nbsp; ') + '</div>';
            }

            if (categories) detailHtml += '<div class="ophim-detail-row"><b>Thể loại:</b> ' + categories + '</div>';
            if (countries)  detailHtml += '<div class="ophim-detail-row"><b>Quốc gia:</b> ' + countries + '</div>';
            if (directors)  detailHtml += '<div class="ophim-detail-row"><b>Đạo diễn:</b> ' + directors + '</div>';
            if (actors)     detailHtml += '<div class="ophim-detail-row"><b>Diễn viên:</b> ' + actors + '</div>';

            if (description) {
                detailHtml += '<div class="ophim-detail-desc">' + description + '</div>';
            }

            detailHtml += '</div>'; // .ophim-detail-info
            detailHtml += '</div>'; // .ophim-detail-wrap

            html.html(detailHtml);
            scroll.append(html);

            // ---- Episodes section ----
            if (episodes && episodes.length) {
                episodes.forEach(function (server) {
                    if (!server.server_data || !server.server_data.length) return;

                    var serverTitle = $('<div class="ophim-server-title">' + (server.server_name || 'Server') + '</div>');
                    scroll.append(serverTitle);

                    var epContainer = $('<div class="ophim-episodes"></div>');

                    server.server_data.forEach(function (ep) {
                        var epBtn = $('<div class="ophim-episode selector" tabindex="0">' + (ep.name || '?') + '</div>');

                        epBtn.on('hover:enter', function () {
                            playEpisode(ep, movie);
                        });

                        epBtn.on('hover:focus', function () {
                            scroll.update(epBtn, true);
                        });

                        epContainer.append(epBtn);
                    });

                    scroll.append(epContainer);
                });
            }

            // Activate controller for remote control
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        }

        function playEpisode(ep, movie) {
            var streamUrl = ep.link_m3u8 || ep.link_embed || '';

            if (!streamUrl) {
                Lampa.Noty.show('Không tìm thấy link phát');
                return;
            }

            // Check if it's a direct stream link (m3u8/mp4)
            var isDirect = streamUrl.indexOf('.m3u8') !== -1 || streamUrl.indexOf('.mp4') !== -1;

            if (isDirect) {
                // Play directly with ExoPlayer
                Lampa.Player.play({
                    title:  (movie.name || '') + ' - ' + (ep.name || ''),
                    url:    streamUrl,
                    quality: {},
                    timeline: {
                        title: movie.name || '',
                        img:   imageUrl(movie.thumb_url)
                    }
                });

                Lampa.Player.playlist([{
                    title:  (movie.name || '') + ' - ' + (ep.name || ''),
                    url:    streamUrl,
                    quality: {}
                }]);
            } else {
                // Embed URL — try to load and extract
                Lampa.Player.play({
                    title:  (movie.name || '') + ' - ' + (ep.name || ''),
                    url:    streamUrl,
                    quality: {},
                    timeline: {
                        title: movie.name || '',
                        img:   imageUrl(movie.thumb_url)
                    }
                });

                Lampa.Player.playlist([{
                    title:  (movie.name || '') + ' - ' + (ep.name || ''),
                    url:    streamUrl,
                    quality: {}
                }]);
            }
        }
    }

    // =========================================================================
    // COMPONENT: OPhim Home (trang chủ)
    // =========================================================================

    function OPhimHome(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var html    = $('<div class="ophim-home"></div>');

        var sections = [
            { slug: 'phim-moi',       title: '🎬 Phim Mới Cập Nhật' },
            { slug: 'phim-bo',        title: '📺 Phim Bộ' },
            { slug: 'phim-le',        title: '🎥 Phim Lẻ' },
            { slug: 'phim-chieu-rap', title: '🍿 Phim Chiếu Rạp' },
            { slug: 'hoat-hinh',      title: '🎨 Hoạt Hình' },
            { slug: 'tv-shows',       title: '📡 TV Shows' }
        ];

        this.create = function () {
            this.activity.title(PLUGIN_NAME);
            this.activity.loader(true);

            var self = this;
            var loaded = 0;
            var totalSections = sections.length;

            sections.forEach(function (section) {
                loadSection(section, function () {
                    loaded++;
                    if (loaded >= totalSections) {
                        self.activity.loader(false);

                        // Activate controller
                        Lampa.Controller.add('content', {
                            toggle: function () {
                                Lampa.Controller.collectionSet(scroll.render());
                                Lampa.Controller.collectionFocus(false, scroll.render());
                            },
                            back: function () {
                                Lampa.Activity.backward();
                            }
                        });

                        Lampa.Controller.toggle('content');
                    }
                });
            });

            return this.render();
        };

        this.start   = this.create;
        this.render   = function () { return scroll.render(true); };
        this.pause    = function () {};
        this.stop     = function () {};
        this.destroy  = function () { network.clear(); scroll.destroy(); };

        function loadSection(section, callback) {
            var url = API_BASE + '/danh-sach/' + section.slug + '?page=1&limit=12';

            var net = new Lampa.Reguest();
            net.timeout(15000);
            net.silent(url, function (json) {
                var data  = (json && json.data) || {};
                var items = data.items || [];

                if (items.length) {
                    // Section title (clickable → opens full list)
                    var titleEl = $('<div class="ophim-section-title selector" tabindex="0">' + section.title + ' ▸</div>');
                    titleEl.on('hover:enter', function () {
                        Lampa.Activity.push({
                            url:       '',
                            title:     section.title,
                            component: 'ophim_catalog',
                            slug:      section.slug,
                            url_type:  'list',
                            page:      1
                        });
                    });
                    titleEl.on('hover:focus', function () {
                        scroll.update(titleEl, true);
                    });
                    scroll.append(titleEl);

                    // Horizontal row of cards
                    var row = $('<div class="ophim-row"></div>');

                    items.forEach(function (item) {
                        var card = mapItem(item);
                        var cardEl = $('<div class="ophim-card selector" tabindex="0"></div>');
                        cardEl.html(
                            '<div class="ophim-card-img" style="background-image:url(' + card.img + ')">' +
                            (card.quality ? '<span class="ophim-badge-quality">' + card.quality + '</span>' : '') +
                            (card.episode ? '<span class="ophim-badge-episode">' + card.episode + '</span>' : '') +
                            '</div>' +
                            '<div class="ophim-card-title">' + card.title + '</div>' +
                            (card.year ? '<div class="ophim-card-year">' + card.year + '</div>' : '')
                        );

                        cardEl.on('hover:enter', function () {
                            Lampa.Activity.push({
                                url:       '',
                                title:     card.title,
                                component: 'ophim_detail',
                                slug:      card.ophim_slug || card.id,
                                movie:     card,
                                page:      1
                            });
                        });

                        cardEl.on('hover:focus', function () {
                            scroll.update(cardEl, true);
                        });

                        row.append(cardEl);
                    });

                    scroll.append(row);
                }

                callback();
            }, function () {
                callback();
            });
        }
    }

    // =========================================================================
    // COMPONENT: OPhim Categories (thể loại)
    // =========================================================================

    function OPhimCategories(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });

        this.create = function () {
            this.activity.title('Thể Loại Phim');
            this.activity.loader(true);
            var self = this;

            var url = API_BASE + '/the-loai';
            network.timeout(15000);
            network.silent(url, function (json) {
                self.activity.loader(false);
                var data = (json && json.data) || json || {};
                var items = data.items || (Array.isArray(data) ? data : []);

                if (items.length) {
                    var container = $('<div class="ophim-categories"></div>');

                    items.forEach(function (cat) {
                        var catEl = $('<div class="ophim-category-item selector" tabindex="0">' + (cat.name || '') + '</div>');

                        catEl.on('hover:enter', function () {
                            Lampa.Activity.push({
                                url:       '',
                                title:     cat.name,
                                component: 'ophim_catalog',
                                slug:      cat.slug,
                                url_type:  'category',
                                page:      1
                            });
                        });

                        catEl.on('hover:focus', function () {
                            scroll.update(catEl, true);
                        });

                        container.append(catEl);
                    });

                    scroll.append(container);
                } else {
                    var emptyEl = $('<div class="ophim-empty">Không có thể loại</div>');
                    scroll.append(emptyEl);
                }

                // Activate controller
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    },
                    back: function () {
                        Lampa.Activity.backward();
                    }
                });

                Lampa.Controller.toggle('content');
            }, function () {
                self.activity.loader(false);
                Lampa.Noty.show('Lỗi tải thể loại');
            });

            return this.render();
        };

        this.start   = this.create;
        this.render  = function () { return scroll.render(true); };
        this.pause   = function () {};
        this.stop    = function () {};
        this.destroy = function () { network.clear(); scroll.destroy(); };
    }

    // =========================================================================
    // CSS STYLES
    // =========================================================================

    function addStyles() {
        var css = '\
        .ophim-home, .ophim-detail { padding: 1em; }\
        \
        .ophim-section-title {\
            font-size: 1.4em;\
            font-weight: 700;\
            color: #fff;\
            padding: 0.8em 0 0.4em;\
            cursor: pointer;\
            transition: color 0.2s;\
        }\
        .ophim-section-title.focus,\
        .ophim-section-title:hover { color: #4fd1c5; }\
        \
        .ophim-row {\
            display: flex;\
            flex-wrap: nowrap;\
            overflow-x: auto;\
            gap: 0.8em;\
            padding-bottom: 1em;\
            scroll-behavior: smooth;\
        }\
        \
        .ophim-card {\
            flex: 0 0 10em;\
            cursor: pointer;\
            border-radius: 0.6em;\
            overflow: hidden;\
            background: rgba(255,255,255,0.05);\
            transition: transform 0.2s, box-shadow 0.2s;\
        }\
        .ophim-card.focus,\
        .ophim-card:hover {\
            transform: scale(1.08);\
            box-shadow: 0 0 0 3px #4fd1c5, 0 8px 25px rgba(79,209,197,0.3);\
        }\
        \
        .ophim-card-img {\
            width: 100%;\
            padding-top: 140%;\
            background-size: cover;\
            background-position: center;\
            background-color: #1a1a2e;\
            position: relative;\
        }\
        \
        .ophim-badge-quality {\
            position: absolute;\
            top: 0.4em;\
            left: 0.4em;\
            background: linear-gradient(135deg, #667eea, #764ba2);\
            color: #fff;\
            font-size: 0.7em;\
            font-weight: 700;\
            padding: 0.15em 0.5em;\
            border-radius: 0.3em;\
        }\
        \
        .ophim-badge-episode {\
            position: absolute;\
            bottom: 0.4em;\
            right: 0.4em;\
            background: rgba(0,0,0,0.75);\
            color: #4fd1c5;\
            font-size: 0.65em;\
            font-weight: 600;\
            padding: 0.15em 0.5em;\
            border-radius: 0.3em;\
        }\
        \
        .ophim-card-title {\
            padding: 0.4em 0.5em 0.1em;\
            font-size: 0.8em;\
            font-weight: 600;\
            color: #eee;\
            white-space: nowrap;\
            overflow: hidden;\
            text-overflow: ellipsis;\
        }\
        \
        .ophim-card-year {\
            padding: 0 0.5em 0.4em;\
            font-size: 0.65em;\
            color: #888;\
        }\
        \
        /* Detail page */\
        .ophim-detail-wrap {\
            display: flex;\
            gap: 1.5em;\
            padding-bottom: 1.5em;\
        }\
        .ophim-detail-poster {\
            flex: 0 0 14em;\
        }\
        .ophim-detail-poster img {\
            width: 100%;\
            border-radius: 0.6em;\
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);\
        }\
        .ophim-detail-info {\
            flex: 1;\
        }\
        .ophim-detail-title {\
            font-size: 1.6em;\
            font-weight: 700;\
            color: #fff;\
            margin-bottom: 0.2em;\
        }\
        .ophim-detail-origin {\
            font-size: 1em;\
            color: #999;\
            font-style: italic;\
            margin-bottom: 0.5em;\
        }\
        .ophim-detail-meta {\
            font-size: 0.85em;\
            color: #4fd1c5;\
            margin-bottom: 0.8em;\
        }\
        .ophim-detail-row {\
            font-size: 0.85em;\
            color: #ccc;\
            margin-bottom: 0.3em;\
        }\
        .ophim-detail-row b {\
            color: #eee;\
        }\
        .ophim-detail-desc {\
            font-size: 0.85em;\
            color: #aaa;\
            line-height: 1.6;\
            margin-top: 0.8em;\
            max-height: 8em;\
            overflow-y: auto;\
        }\
        \
        /* Episodes */\
        .ophim-server-title {\
            font-size: 1.1em;\
            font-weight: 700;\
            color: #4fd1c5;\
            padding: 0.6em 0 0.3em;\
            border-top: 1px solid rgba(255,255,255,0.1);\
        }\
        .ophim-episodes {\
            display: flex;\
            flex-wrap: wrap;\
            gap: 0.5em;\
            padding-bottom: 1em;\
        }\
        .ophim-episode {\
            background: rgba(255,255,255,0.08);\
            color: #eee;\
            padding: 0.5em 1em;\
            border-radius: 0.4em;\
            font-size: 0.85em;\
            font-weight: 600;\
            cursor: pointer;\
            transition: background 0.2s, transform 0.15s;\
            border: 2px solid transparent;\
        }\
        .ophim-episode.focus,\
        .ophim-episode:hover {\
            background: linear-gradient(135deg, #667eea, #764ba2);\
            color: #fff;\
            transform: scale(1.1);\
            border-color: #4fd1c5;\
        }\
        \
        /* Categories */\
        .ophim-categories {\
            display: flex;\
            flex-wrap: wrap;\
            gap: 0.6em;\
            padding: 1em;\
        }\
        .ophim-category-item {\
            background: rgba(255,255,255,0.06);\
            color: #ddd;\
            padding: 0.6em 1.2em;\
            border-radius: 0.5em;\
            font-size: 0.9em;\
            font-weight: 600;\
            cursor: pointer;\
            transition: background 0.2s, transform 0.15s;\
            border: 2px solid transparent;\
        }\
        .ophim-category-item.focus,\
        .ophim-category-item:hover {\
            background: linear-gradient(135deg, #4fd1c5, #38b2ac);\
            color: #fff;\
            transform: scale(1.08);\
            border-color: #fff;\
        }\
        \
        .ophim-empty {\
            color: #888;\
            text-align: center;\
            padding: 3em;\
            font-size: 1.1em;\
        }\
        ';

        if (!document.getElementById('ophim-lampa-styles')) {
            var style = document.createElement('style');
            style.id = 'ophim-lampa-styles';
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    // =========================================================================
    // MENU & SEARCH INTEGRATION
    // =========================================================================

    function addMenu() {
        // Icon SVG for the menu
        var icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm2 2l6 4-6 4V8z"/></svg>';

        // Add to main menu
        var menuItem = $('<li class="menu__item selector" data-action="ophim_home">' +
            '<div class="menu__ico">' + icon + '</div>' +
            '<div class="menu__text">' + PLUGIN_NAME + '</div>' +
            '</li>');

        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                url:       '',
                title:     PLUGIN_NAME,
                component: 'ophim_home',
                page:      1
            });
        });

        // Insert after existing menu items
        var menu = $('.menu .menu__list');
        if (menu.length) {
            menu.append(menuItem);
        }

        // Add categories sub-item
        var catItem = $('<li class="menu__item selector" data-action="ophim_categories">' +
            '<div class="menu__ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h8v8h-8v-8zm2 2v4h4v-4h-4z"/></svg></div>' +
            '<div class="menu__text">Thể Loại</div>' +
            '</li>');

        catItem.on('hover:enter', function () {
            Lampa.Activity.push({
                url:       '',
                title:     'Thể Loại Phim',
                component: 'ophim_categories',
                page:      1
            });
        });

        if (menu.length) {
            menu.append(catItem);
        }
    }

    function addSearch() {
        // Hook into search events
        Lampa.Listener.follow('search', function (e) {
            if (e.query && e.query.length >= 2) {
                // Add OPhim search result section
                var searchComponent = e;

                var url = API_BASE + '/tim-kiem?keyword=' + encodeURIComponent(e.query) + '&page=1&limit=12';

                var net = new Lampa.Reguest();
                net.timeout(15000);
                net.silent(url, function (json) {
                    var data  = (json && json.data) || {};
                    var items = data.items || [];

                    if (items.length) {
                        var results = items.map(function (item) {
                            var card = mapItem(item);
                            return {
                                title:       card.title,
                                original_title: card.original_title,
                                img:         card.img,
                                year:        card.year,
                                vote_average: 0,
                                id:          card.id,
                                ophim_slug:  card.ophim_slug,
                                ophim:       true
                            };
                        });

                        // Add search results to Lampa's search if possible
                        if (Lampa.Search && Lampa.Search.add) {
                            Lampa.Search.add(PLUGIN_NAME, results, function (item) {
                                Lampa.Activity.push({
                                    url:       '',
                                    title:     item.title,
                                    component: 'ophim_detail',
                                    slug:      item.ophim_slug || item.id,
                                    movie:     item,
                                    page:      1
                                });
                            });
                        }
                    }
                }, function () {});
            }
        });
    }

    // =========================================================================
    // REGISTER COMPONENTS
    // =========================================================================

    function initPlugin() {
        // Add CSS
        addStyles();

        // Register components
        Lampa.Component.add('ophim_home', OPhimHome);
        Lampa.Component.add('ophim_detail', OPhimDetail);
        Lampa.Component.add('ophim_catalog', OPhimCatalog);
        Lampa.Component.add('ophim_categories', OPhimCategories);

        // Add menu & search when app is ready
        if (window.appready) {
            addMenu();
            addSearch();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') {
                    addMenu();
                    addSearch();
                }
            });
        }

        Lampa.Noty.show(PLUGIN_NAME + ' v1.0.0 — Đã tải thành công!', 3000);
    }

    // =========================================================================
    // BOOTSTRAP
    // =========================================================================

    if (window.Lampa) {
        // Lampa already loaded
        initPlugin();
    } else {
        // Wait for Lampa
        var checkInterval = setInterval(function () {
            if (window.Lampa) {
                clearInterval(checkInterval);
                initPlugin();
            }
        }, 200);

        // Timeout after 30 seconds
        setTimeout(function () {
            clearInterval(checkInterval);
        }, 30000);
    }

})();
