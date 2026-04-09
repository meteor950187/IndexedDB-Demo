var GameCodeBridge = function (url, second, notifyGameLoadEnd, EachGCSyncAction) {
    var GCBSelf = this;
    var myWorker;
    var APIUrl = url;

    function init() {
        // In the following line, you should include the prefixes of implementations you want to test.
        window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        // DON'T use "var indexedDB = ..." if you're not in a function.
        // Moreover, you may need references to some window.IDB* objects:
        window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
        window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;

        myWorker = new Worker("/Scripts/workerByJson.js");

        myWorker.postMessage({
            Cmd: "Init",
            Params: [url, second]
        });

        GCBSelf.InitPromise = new Promise((resolve, reject) => {
            myWorker.onmessage = (function (e) {
                if (e.data) {
                    switch (e.data.Cmd) {
                        case "InitSyncStart":
                            if (e.data.Data == true) {
                                GCBSelf.IsFirstLoaded = true;
                                resolve();
                                //GCBSelf.InitDB(resolve);                                         
                            }

                            break;

                        case "InitSyncEnd":
                            if (GCBSelf.IsFirstLoaded == false) {
                                GCBSelf.IsFirstLoaded = true;
                                resolve();
                                //GCBSelf.InitDB(resolve);
                            }
                            break;
                        default:
                            break;
                    }
                }
            });
        });

        GCBSelf.InitPromise.then(GCBSelf.NotifyGameLoadEnd);
    }

    this.InitDB = function (resolve) {
        //var DBOpenRequest = window.indexedDB.open('GameCodeDB');


    };

    var getDB = function () {
        return new Promise((resolve, reject) => {
            var DBOpenRequest = window.indexedDB.open('GameCodeDB');

            DBOpenRequest.onsuccess = function (event) {
                var IndexedDB = event.target.result;
                resolve(IndexedDB);
            };
        });
    };

    var callService = function (URL, postObject, timeoutMS, cb) {
        var xmlHttp = new XMLHttpRequest;
        var postData;

        if (postObject)
            postData = JSON.stringify(postObject);

        xmlHttp.open("POST", URL, true);
        xmlHttp.onreadystatechange = function () {
            if (this.readyState == 4) {
                var contentText = this.responseText;

                if (this.status == "200") {
                    if (cb) {
                        cb(true, contentText);
                    }
                } else {
                    cb(false, contentText);
                }
            }
        };

        xmlHttp.timeout = timeoutMS;
        xmlHttp.ontimeout = function () {
            /*
            timeoutTryCount += 1;
 
            if (timeoutTryCount < 2)
                xmlHttp.send(postData);
            else*/
            if (cb)
                cb(false, "Timeout");
        };

        xmlHttp.setRequestHeader("Content-Type", "application/json; charset=utf-8");
        xmlHttp.send(postData);
    };

    var getJSON = function (text) {
        var obj = JSON.parse(text);

        if (obj) {
            if (obj.hasOwnProperty('d')) {
                return obj.d;
            } else {
                return obj;
            }
        }
    };
    //搜尋方法 cb回傳統一為一個或多個GameCodeItem

    /**
     * 
     * @param {string} GameCode    遊戲代碼
     * @param {Function} cb 找到資料時的cb, param => data, null時為無資料
     */
    this.GetByGameCode2 = function (GameCode, cb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');

            objectStore.get(GameCode).onsuccess = function (event) {
                if (cb) {
                    if (event.target.result) {
                        cb(event.target.result);
                    } else {
                        cb(null);
                    }
                }

                IndexedDB.close();
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
        //if (GCBSelf.IsFirstLoaded) {
        //    event();
        //} else {

        //}
    };

    this.GetByGameCode = function (GameCode, cb) {
        if (GCBSelf.IsFirstLoaded) {
            return GCBSelf.GetByGameCode2(GameCode, cb);
        }

        var isDone = false;
        var queueBackUp = () => {
            if (!isDone) {
                isDone = true;

                GCBSelf.GetCompanyGameCode(Math.uuid(), GameCode, function (success, o) {
                    if (success) {
                        if (o.Result == 0) {
                            let data = o.Data;
                            data.ChampionType = 0;
                            data.FavoTimeStamp = null;
                            data.PlayedTimeStamp = null;
                            if (data.Language != "null") {
                                data.Language = JSON.parse(data.Language);
                            } else {
                                data.Language = [];
                            }

                            if (data.Tags != "null" && data.Tags != "") {
                                data.Tags = JSON.parse(data.Tags);
                            } else {
                                data.Tags = [];
                            }

                            cb(data);
                        } else {
                            cb(null);
                        }
                    } else {
                        cb(null);
                    }
                });
            }
        };
        var queue = (IndexedDB) => {
            if (!isDone) {
                isDone = true;

                try {
                    var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
                    var objectStore = transaction.objectStore('GameCodes');

                    objectStore.get(GameCode).onsuccess = function (event) {
                        if (cb) {
                            if (event.target.result) {
                                cb(event.target.result);
                            } else {
                                cb(null);
                            }
                        }
                        IndexedDB.close();
                    };
                } catch (e) {
                    isDone = false;
                }               
            }
        };

        setTimeout(queueBackUp, 10);
        GCBSelf.InitPromise.then(getDB).then(queue);
    };

    /**
     * 
     * @param {any} GameBrand   遊戲廠牌
     * @param {any} cb  資料迭代cb, param => data
     * @param {any} endCb 結束cb, param => true=結束,有找到資料 false=結束,無找到資料
     */
    this.CursorGetByGameBrand = function (GameBrand, cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("GameBrand");
            var isDataExist = false;
            var range = IDBKeyRange.bound([GameBrand, 0], [GameBrand, 99])
            //var count = index.count();

            index.openCursor(range, "prev").onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.GameStatus == 0) {
                        isDataExist = true;
                        if (cb) {
                            cb(cursor.value);
                        }
                    }

                    cursor.continue();
                } else {
                    if (endCb) {
                        endCb(isDataExist);
                    }
                    IndexedDB.close();
                }
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    };

    /**
     * 
     * @param {any} GameBrand   遊戲廠牌
     * @param {any} cb  資料迭代cb, param => data
     * @param {any} endCb 結束cb, param => true=結束,有找到資料 false=結束,無找到資料
     */
    this.CursorGetGameCategoryCodeByGameBrand = function (GameBrand, cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCategory'], 'readonly');
            var objectStore = transaction.objectStore('GameCategory');
            var index = objectStore.index("GameBrand");
            var isDataExist = false;
            //var count = index.count();

            index.openCursor(GameBrand).onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    isDataExist = true;
                    if (cb) {
                        cb(cursor.value);
                    }
                    cursor.continue();
                } else {
                    endCb(isDataExist);
                }
                IndexedDB.close();
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    };

    /**
     *
     * @param {any} GameCategoryCode   遊戲分類代碼
     * @param {any} cb  資料迭代cb, param => data
     * @param {any} endCb 結束cb, param => true=結束,有找到資料 false=結束,無找到資料
     */
    this.CursorGetByCategoryCode = function (GameCategoryCode, cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("GameCategoryCode");
            var isDataExist = false;
            var range = IDBKeyRange.bound([GameCategoryCode, 0], [GameCategoryCode, 99])
            //var count = index.count();
            index.openCursor(range, "prev").onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.GameStatus == 0) {
                        isDataExist = true;
                        if (cb) {
                            cb(cursor.value);
                        }
                    }
                    cursor.continue();
                } else {
                    if (endCb) {
                        endCb(isDataExist);
                    }
                    IndexedDB.close();
                }
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    };

    /**
     *
     * @param {any} GameCategoryCode   遊戲分類代碼
     * @param {any} GameCategorySubCode   遊戲次分類代碼
     * @param {any} cb  資料迭代cb, param => data
     * @param {any} endCb 結束cb, param => true=結束,有找到資料 false=結束,無找到資料
     */
    this.CursorGetByCategorySubCode = function (GameCategoryCode, GameCategorySubCode, cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("GameCategorySubCode");
            var isDataExist = false;
            var range = IDBKeyRange.bound([GameCategoryCode, GameCategorySubCode, 0], [GameCategoryCode, GameCategorySubCode, 99])
            index.openCursor(range, "prev").onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.GameStatus == 0) {
                        isDataExist = true;
                        if (cb) {
                            cb(cursor.value);
                        }
                    }
                    cursor.continue();
                } else {
                    if (endCb) {
                        endCb(isDataExist);
                    }
                    IndexedDB.close();
                }
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    };

    //#region Favo

    /**
   * 
   * @param {any} GameCode    遊戲代碼
   * @param {any} type   cb, param => 0=Favo,1=History of Play
   * @param {any} cb   cb, param => true=成功, false=失敗FavoTag
   */
    this.AddFavo = function (GameCode, cb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readwrite');
            var objectStore = transaction.objectStore('GameCodes');

            objectStore.get(GameCode).onsuccess = function (event) {
                if (event.target.result) {
                    var data = event.target.result;
                    data.FavoTimeStamp = new Date().getTime();
                    data.IsFavo = 1;
                    objectStore.put(data);

                    if (cb) {
                        cb(true);
                    }
                } else {
                    if (cb) {
                        cb(false);
                    }
                }

                IndexedDB.close();
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }


    /**
     * 
     * @param {any} GameID    遊戲代碼
     * @param {any} type   cb, param => 0=Favo,1=History of Play
     * @param {any} cb   cb, param => true=成功, false=失敗FavoTag
     */
    this.AddFavoByGameID = function (GameID, cb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readwrite');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("GameID");

            index.get(GameID).onsuccess = function (event) {
                if (event.target.result) {
                    var data = event.target.result;
                    data.FavoTimeStamp = new Date().getTime();
                    data.IsFavo = 1;
                    objectStore.put(data);

                    if (cb) {
                        cb(true);
                    }
                } else {
                    if (cb) {
                        cb(false);
                    }
                }

                IndexedDB.close();
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }


    /**
     * 
     * @param {any} GameID    遊戲代碼     
     * @param {any} cb   cb, param => true=成功, false=失敗FavoTag
     */
    this.RemoveFavo = function (GameCode, cb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readwrite');
            var objectStore = transaction.objectStore('GameCodes');

            objectStore.get(GameCode).onsuccess = function (event) {
                if (event.target.result) {
                    var data = event.target.result;
                    data.FavoTimeStamp = null;
                    data.IsFavo = 0;
                    objectStore.put(data);

                    if (cb) {
                        cb(true);
                    }
                } else {
                    if (cb) {
                        cb(false);
                    }
                }

                IndexedDB.close();
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    /**
     * 
     * @param {any} cb
     * @param {any} endCb
     */
    this.GetFavo = function (cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("PersonalFavo");
            var range = IDBKeyRange.bound([1, 0], [1, 2000000000000])
            var isDataExist = false;

            //var count = index.count();
            index.openCursor(range, "prev").onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (cb) {
                        if (cursor.value.GameStatus == 0) {
                            isDataExist = true;
                            cb(cursor.value);
                        }
                    }
                    cursor.continue();
                } else {
                    if (endCb) {
                        endCb(isDataExist);
                    }
                    IndexedDB.close();
                }
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    //#endregion 

    //#region Played

    /**
     * 
     * @param {any} GameCode    遊戲代碼
     * @param {any} type   cb, param => 0=Favo,1=History of Play
     * @param {any} cb   cb, param => true=成功, false=失敗FavoTag
     */
    this.AddPlayed = function (GameCode, cb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readwrite');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("PersonalPlayed");
            var range = IDBKeyRange.bound([1, 0], [1, 2000000000000])

            index.count(range).onsuccess = function (event) {
                var count = event.target.result;

                if (count >= 20) {
                    index.openCursor(range).onsuccess = function (event) {
                        var cursor = event.target.result;
                        if (cursor) {
                            var data = cursor.value;
                            data.PlayedTimeStamp = null;
                            data.IsPlayed = 0;
                            objectStore.put(data);
                        }
                    };
                }

                objectStore.get(GameCode).onsuccess = function (event) {
                    if (event.target.result) {
                        var data = event.target.result;
                        data.PlayedTimeStamp = new Date().getTime();
                        data.IsPlayed = 1;
                        objectStore.put(data);

                        if (cb) {
                            cb(true);
                        }
                    } else {
                        if (cb) {
                            cb(false);
                        }
                    }

                    IndexedDB.close();
                };
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    /**
     * 
     * @param {any} GameID    遊戲代碼     
     * @param {any} cb   cb, param => true=成功, false=失敗FavoTag
     */
    this.RemovePlayed = function (GameCode, cb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readwrite');
            var objectStore = transaction.objectStore('GameCodes');

            objectStore.get(GameCode).onsuccess = function (event) {
                if (event.target.result) {
                    var data = event.target.result;
                    data.PlayedTimeStamp = null;
                    data.IsPlayed = 0;
                    objectStore.put(data);

                    if (cb) {
                        cb(true);
                    }
                } else {
                    if (cb) {
                        cb(false);
                    }
                }

                IndexedDB.close();
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    /**
     * 
     * @param {any} cb
     * @param {any} endCb
     */
    this.GetPlayed = function (cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            var index = objectStore.index("PersonalPlayed");
            var range = IDBKeyRange.bound([1, 0], [1, 2000000000000])
            var isDataExist = false;

            //var count = index.count();
            index.openCursor(range, "prev").onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (cb) {
                        if (cursor.value.GameStatus == 0) {
                            isDataExist = true;
                            cb(cursor.value);
                        }
                    }
                    cursor.continue();
                } else {
                    if (endCb) {
                        endCb(isDataExist);
                    }
                    IndexedDB.close();
                }
            };
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    //#endregion 

    /**
     * 
     * @param {any} type
     * @param {any} cb
     * @param {any} endCb
     */
    this.GetPersonal = function (type, cb, endCb) {
        if (type == 0) {
            GCBSelf.GetFavo(cb, endCb);
        } else if (type == 1) {
            GCBSelf.GetPlayed(cb, endCb);
        } else {
            GCBSelf.GetFavo(cb, endCb);
        }
    }


    /**
     *  搜尋，取交集
     * @param {any} GameBrand 遊戲廠牌
     * @param {any} GameCategoryCode 遊戲分類
     * @param {any} GameCategorySubCode 遊戲次分類(使用時請連遊戲分類一起給)
     * @param {any} SearchKeyWord   搜尋關鍵字(如果為5位數內的數字，視為GameID做搜尋，並回傳單一GameItem)
     * @param {any} cb  迭代fun
     * @param {any} endCb   結束fun(isDataExist) => isDataExist=true 有資料, isDataExist=false 無資料
     */
    this.CursorGetByMultiSearch = function (GameBrand, GameCategoryCode, GameCategorySubCode, SearchKeyWord, cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            //var index = null;
            var request;
            var searchGameID;
            var isSearchKeyRequest;
            var isDataExist = false;

            if (SearchKeyWord && SearchKeyWord.length < 6) {
                //如果關鍵字為GameID，特別拉出來做處理，由於結果一定為單一值，不做複合搜尋
                var searchGameID = Number(SearchKeyWord);

                if (searchGameID) {
                    objectStore.index("GameID").get(searchGameID).onsuccess = function (event) {
                        if (event.target.result) {
                            if (event.target.result.GameStatus == 0) {
                                isDataExist = true;
                                if (cb) {
                                    cb(event.target.result);
                                }
                            }
                        }

                        if (endCb) {
                            endCb(isDataExist);
                        }

                        IndexedDB.close();
                    };

                    return;
                }
            }


            if (GameBrand) {
                var range = IDBKeyRange.bound([GameBrand, 0], [GameBrand, 99])
                request = objectStore.index("GameBrand").openCursor(range, "prev");
            } else if (GameCategoryCode && GameCategorySubCode) {
                var range = IDBKeyRange.bound([GameBrand, GameCategorySubCode, 0], [GameCategoryCode, GameCategorySubCode, 99])
                request = objectStore.index("GameCategorySubCode").openCursor(range, "prev");
            } else if (GameCategoryCode) {
                var range = IDBKeyRange.bound([GameCategoryCode, 0], [GameCategoryCode, 99]);
                request = objectStore.index("GameCategoryCode").openCursor(range, "prev");
            } else if (SearchKeyWord) {
                request = objectStore.index("SearchKeyWord").openCursor(SearchKeyWord.toLowerCase());
                isSearchKeyRequest = true;
            } else {
                if (endCb) {
                    endCb(isDataExist);
                }
                IndexedDB.close();
                return;
            }

            request.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    var gameCodeItem = cursor.value;
                    var checkFlag = true;

                    if (GameBrand && gameCodeItem.GameBrand != GameBrand) {
                        checkFlag = false;
                    } else if ((GameCategoryCode && GameCategorySubCode) && (gameCodeItem.GameCategoryCode != GameCategoryCode || gameCodeItem.GameCategorySubCode != GameCategorySubCode)) {
                        checkFlag = false;
                    } else if (GameCategoryCode && gameCodeItem.GameCategoryCode != GameCategoryCode) {
                        checkFlag = false;
                    } else if (SearchKeyWord) {
                        var searchFlag = false;
                        var targetSearch = SearchKeyWord.toLowerCase();

                        switch (targetSearch) {

                            case gameCodeItem.GameCode.toLowerCase():
                                searchFlag = true;
                                break;
                            case gameCodeItem.GameBrand.toLowerCase():
                                searchFlag = true;
                                break;
                            case gameCodeItem.GameCategoryCode.toLowerCase():
                                searchFlag = true;
                                break;
                            case gameCodeItem.GameCategorySubCode.toLowerCase():
                                searchFlag = true;
                                break;
                        }

                        if (searchFlag == false) {
                            for (var i = 0; i < gameCodeItem.Tags.length; i++) {
                                if (targetSearch.includes(gameCodeItem.Tags[i].toLowerCase())) {
                                    searchFlag = true;
                                    break;
                                }

                                if (SearchKeyWord.length >= 2 && gameCodeItem.Tags[i].toLowerCase().includes(targetSearch)) {
                                    searchFlag = true;
                                    break;
                                }
                            }
                        }

                        //不存在關鍵字內，搜尋翻譯後的遊戲名稱
                        if (searchFlag == false) {
                            for (var i = 0; i < gameCodeItem.Language.length; i++) {
                                if (gameCodeItem.Language[i].DisplayText.toLowerCase().includes(targetSearch)) {
                                    searchFlag = true;
                                    break;
                                }
                            }
                        }

                        if (searchFlag == false) {
                            checkFlag = false;
                        }
                    }

                    if (checkFlag) {
                        if (gameCodeItem.GameStatus == 0) {
                            isDataExist = true;
                            if (cb) {
                                cb(gameCodeItem);
                            }
                        }
                    }

                    cursor.continue();
                } else {
                    //沒有資料，且為關鍵字搜尋，做全部資料的mapping
                    if (isDataExist == false && isSearchKeyRequest) {
                        var updateDatas = [];

                        objectStore.openCursor().onsuccess = function (event) {
                            var cursor = event.target.result;
                            if (cursor) {
                                var gameCodeItem = cursor.value;
                                var searchFlag = false;
                                var targetSearch = SearchKeyWord.toLowerCase();

                                switch (targetSearch) {

                                    case gameCodeItem.GameCode.toLowerCase():
                                        searchFlag = true;
                                        break;
                                    case gameCodeItem.GameBrand.toLowerCase():
                                        searchFlag = true;
                                        break;
                                    case gameCodeItem.GameCategoryCode.toLowerCase():
                                        searchFlag = true;
                                        break;
                                    case gameCodeItem.GameCategorySubCode.toLowerCase():
                                        searchFlag = true;
                                        break;
                                }

                                if (searchFlag == false) {
                                    for (var i = 0; i < gameCodeItem.Tags.length; i++) {
                                        if (targetSearch.includes(gameCodeItem.Tags[i].toLowerCase())) {
                                            searchFlag = true;
                                            break;
                                        }

                                        if (SearchKeyWord.length >= 2 && gameCodeItem.Tags[i].toLowerCase().includes(gameCodeItem.Tags[i])) {
                                            searchFlag = true;
                                            break;
                                        }
                                    }
                                }

                                //不存在關鍵字內，搜尋翻譯後的遊戲名稱
                                if (searchFlag == false) {
                                    for (var i = 0; i < gameCodeItem.Language.length; i++) {
                                        if (gameCodeItem.Language[i].DisplayText.toLowerCase().includes(targetSearch)) {
                                            searchFlag = true;
                                            break;
                                        }
                                    }
                                }

                                if (searchFlag) {
                                    if (gameCodeItem.GameStatus == 0) {
                                        isDataExist = true;
                                        if (cb) {
                                            cb(gameCodeItem);
                                        }
                                    }
                                }

                                cursor.continue();
                            } else {
                                //資料遍歷完
                                if (updateDatas.length >= 20) {
                                    GCBSelf.updateByKeywordSearch(updateDatas, SearchKeyWord.toLowerCase());
                                }

                                if (endCb) {
                                    endCb(isDataExist);
                                }
                                IndexedDB.close();
                            }
                        }
                    } else {
                        if (endCb) {
                            endCb(isDataExist);
                        }
                        IndexedDB.close();
                    }
                }
            };;
        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    /**
     *  搜尋，取交集
     * @param {any} GameBrands 遊戲廠牌
     * @param {any} GameCategoryCode 遊戲分類
     * @param {any} GameCategorySubCode 遊戲次分類(使用時請連遊戲分類一起給)
     * @param {any} SearchKeyWord   搜尋關鍵字(如果為5位數內的數字，視為GameID做搜尋，並回傳單一GameItem)
     * @param {any} cb  迭代fun
     * @param {any} endCb   結束fun(isDataExist) => isDataExist=true 有資料, isDataExist=false 無資料
     */
    this.CursorGetByMultiSearch2 = function (GameBrands, GameCategoryCode, GameCategorySubCode, SearchKeyWord, cb, endCb) {
        var queue = (IndexedDB) => {
            var transaction = IndexedDB.transaction(['GameCodes'], 'readonly');
            var objectStore = transaction.objectStore('GameCodes');
            var mainPromise = Promise.resolve(false);
            var getPromiseForGameBrand = (GameBrand, GameCategoryCode, GameCategorySubCode, SearchKeyWord, cb) => {
                return (PreviousDataExist) => {
                    return new Promise((resolve, reject) => {
                        //var index = null;
                        var request;
                        var searchGameID;
                        var isSearchKeyRequest;
                        var isDataExist = PreviousDataExist;

                        if (SearchKeyWord && SearchKeyWord.length < 6) {
                            //如果關鍵字為GameID，特別拉出來做處理，由於結果一定為單一值，不做複合搜尋
                            var searchGameID = Number(SearchKeyWord);

                            if (searchGameID) {
                                if (isDataExist) {
                                    resolve(isDataExist);
                                } else {

                                    objectStore.index("GameID").get(searchGameID).onsuccess = function (event) {
                                        if (event.target.result) {
                                            if (event.target.result.GameStatus == 0) {
                                                isDataExist = true;
                                                if (cb) {
                                                    cb(event.target.result);
                                                }
                                            }
                                        }

                                        resolve(isDataExist);
                                    };
                                }

                                return;
                            }
                        }


                        if (GameBrand) {
                            var range = IDBKeyRange.bound([GameBrand, 0], [GameBrand, 99])
                            request = objectStore.index("GameBrand").openCursor(range, "prev");
                        } else if (GameCategoryCode && GameCategorySubCode) {
                            var range = IDBKeyRange.bound([GameBrand, GameCategorySubCode, 0], [GameCategoryCode, GameCategorySubCode, 99])
                            request = objectStore.index("GameCategorySubCode").openCursor(range, "prev");
                        } else if (GameCategoryCode) {
                            var range = IDBKeyRange.bound([GameCategoryCode, 0], [GameCategoryCode, 99])
                            request = objectStore.index("GameCategoryCode").openCursor(range, "prev");
                        } else if (SearchKeyWord) {
                            request = objectStore.index("SearchKeyWord").openCursor(SearchKeyWord.toLowerCase());
                            isSearchKeyRequest = true;
                        } else {
                            resolve(isDataExist);
                            return;
                        }

                        request.onsuccess = function (event) {
                            var cursor = event.target.result;
                            if (cursor) {
                                var gameCodeItem = cursor.value;
                                var checkFlag = true;

                                if (GameBrand && gameCodeItem.GameBrand != GameBrand) {
                                    checkFlag = false;
                                } else if ((GameCategoryCode && GameCategorySubCode) && (gameCodeItem.GameCategoryCode != GameCategoryCode || gameCodeItem.GameCategorySubCode != GameCategorySubCode)) {
                                    checkFlag = false;
                                } else if (GameCategoryCode && gameCodeItem.GameCategoryCode != GameCategoryCode) {
                                    checkFlag = false;
                                } else if (SearchKeyWord) {
                                    var searchFlag = false;
                                    var targetSearch = SearchKeyWord.toLowerCase();

                                    switch (targetSearch) {

                                        case gameCodeItem.GameCode.toLowerCase():
                                            searchFlag = true;
                                            break;
                                        case gameCodeItem.GameBrand.toLowerCase():
                                            searchFlag = true;
                                            break;
                                        case gameCodeItem.GameCategoryCode.toLowerCase():
                                            searchFlag = true;
                                            break;
                                        case gameCodeItem.GameCategorySubCode.toLowerCase():
                                            searchFlag = true;
                                            break;
                                    }

                                    if (searchFlag == false) {
                                        for (var i = 0; i < gameCodeItem.Tags.length; i++) {
                                            if (targetSearch.includes(gameCodeItem.Tags[i].toLowerCase())) {
                                                searchFlag = true;
                                                break;
                                            }

                                            if (targetSearch.length >= 2 && gameCodeItem.Tags[i].toLowerCase().includes(targetSearch)) {
                                                searchFlag = true;
                                                break;
                                            }
                                        }
                                    }

                                    //不存在關鍵字內，搜尋翻譯後的遊戲名稱
                                    if (searchFlag == false) {
                                        for (var i = 0; i < gameCodeItem.Language.length; i++) {
                                            if (gameCodeItem.Language[i].DisplayText.toLowerCase().includes(targetSearch)) {
                                                searchFlag = true;
                                                break;
                                            }
                                        }
                                    }

                                    if (searchFlag == false) {
                                        checkFlag = false;
                                    }
                                }

                                if (checkFlag) {
                                    if (gameCodeItem.GameStatus == 0) {
                                        isDataExist = true;
                                        if (cb) {
                                            cb(gameCodeItem);
                                        }
                                    }
                                }

                                cursor.continue();
                            } else {
                                //沒有資料，且為關鍵字搜尋，做全部資料的mapping
                                if (isDataExist == false && isSearchKeyRequest) {
                                    var updateDatas = [];

                                    objectStore.openCursor().onsuccess = function (event) {
                                        var cursor = event.target.result;
                                        if (cursor) {
                                            var gameCodeItem = cursor.value;
                                            var searchFlag = false;
                                            var targetSearch = SearchKeyWord.toLowerCase();

                                            switch (targetSearch) {

                                                case gameCodeItem.GameCode.toLowerCase():
                                                    searchFlag = true;
                                                    break;
                                                case gameCodeItem.GameBrand.toLowerCase():
                                                    searchFlag = true;
                                                    break;
                                                case gameCodeItem.GameCategoryCode.toLowerCase():
                                                    searchFlag = true;
                                                    break;
                                                case gameCodeItem.GameCategorySubCode.toLowerCase():
                                                    searchFlag = true;
                                                    break;
                                            }

                                            if (searchFlag == false) {
                                                for (var i = 0; i < gameCodeItem.Tags.length; i++) {
                                                    if (targetSearch.includes(gameCodeItem.Tags[i].toLowerCase())) {
                                                        searchFlag = true;
                                                        break;
                                                    }

                                                    if (targetSearch.length >= 2 && gameCodeItem.Tags[i].toLowerCase().includes(targetSearch)) {
                                                        searchFlag = true;
                                                        break;
                                                    }
                                                }
                                            }

                                            //不存在關鍵字內，搜尋翻譯後的遊戲名稱
                                            if (searchFlag == false) {
                                                for (var i = 0; i < gameCodeItem.Language.length; i++) {
                                                    if (gameCodeItem.Language[i].DisplayText.toLowerCase().includes(targetSearch)) {
                                                        searchFlag = true;
                                                        break;
                                                    }
                                                }
                                            }

                                            if (searchFlag) {
                                                if (gameCodeItem.GameStatus == 0) {
                                                    isDataExist = true;
                                                    if (cb) {
                                                        cb(gameCodeItem);
                                                    }
                                                }
                                            }

                                            cursor.continue();
                                        } else {
                                            //資料遍歷完
                                            if (updateDatas.length >= 20) {
                                                GCBSelf.updateByKeywordSearch(updateDatas, SearchKeyWord.toLowerCase());
                                                resolve(isDataExist);
                                            } else {
                                                resolve(isDataExist);
                                            }
                                        }
                                    }
                                } else {
                                    resolve(isDataExist);
                                }
                            }
                        };;
                    })
                };
            };

            if (GameBrands && GameBrands.length > 0) {
                for (var i = 0; i < GameBrands.length; i++) {
                    var funReturnPromise = getPromiseForGameBrand(GameBrands[i], GameCategoryCode, GameCategorySubCode, SearchKeyWord, cb);
                    mainPromise = mainPromise.then(funReturnPromise);
                }
            } else {
                mainPromise = mainPromise.then(getPromiseForGameBrand("", GameCategoryCode, GameCategorySubCode, SearchKeyWord, cb))
            }

            mainPromise.then(() => {
                if (endCb) {
                    endCb();
                }
                IndexedDB.close();
            });


        };

        GCBSelf.InitPromise.then(getDB).then(queue);
    }

    this.updateByKeywordSearch = function (datas, searchKeyword) {
        var DBOpenRequest = window.indexedDB.open('GameCodeDB');

        DBOpenRequest.onsuccess = function (event) {
            var IndexedDB = event.target.result;
            if (GCBSelf.IsFirstLoaded) {
                if (datas.length >= 20) {
                    var transaction = IndexedDB.transaction(['GameCodes', 'RealSearchKey'], 'readwrite');
                    var objectStore = transaction.objectStore('GameCodes');
                    var searchKeyObjectStore = transaction.objectStore('RealSearchKey');

                    for (var i = 0; i < datas.length; i++) {
                        var data = datas[i];
                        if (!data.Tags.includes(searchKeyword)) {
                            data.Tags.push(searchKeyword);
                            objectStore.put(data);
                        }
                    }
                    searchKeyObjectStore.put({ RealSearchKey: searchKeyword });

                    transaction.oncomplete = function (event) {
                        IndexedDB.close();
                    };
                }
            }
        };

    }

    this.IsFirstLoaded = false;

    this.InitPromise;

    this.NotifyGameLoadEnd = notifyGameLoadEnd;

    this.GetCompanyGameCode = function (GUID, GameCode, cb) {
        var url = APIUrl + "/GetCompanyGameCode";
        var postData;

        postData = {
            GUID: GUID,
            GameCode: GameCode
        };

        callService(url, postData, 100000, function (success, text) {
            if (success == true) {
                var obj = getJSON(text);

                if (cb)
                    cb(true, obj);
            } else {
                if (cb)
                    cb(false, text);
            }
        });
    };

    init();
}