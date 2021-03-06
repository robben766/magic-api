var MagicEditor = {
    init : function(){
        this.config = {};
        var skin = this.getValue('skin');
        if(skin){
            $('body').addClass('skin-' + skin);
        }
        this.addedGroups = {};
        this.apiId = null;
        this.apiList = [];
        this.debugSessionId = null;
        this.defaultRequestValue = '{\r\n\t"request" : {\r\n\t\t"message" : "Hello MagicAPI!"\r\n\t},\r\n\t"path" : {\r\n\t\t"id" : "123456"\r\n\t},\r\n\t"header" : {\r\n\t\t"token" : "tokenValue"\r\n\t}\r\n}';
        this.initMTA();
        this.initShortKey();
        this.initSkin();
        this.initLeftToobarContainer();
        this.initBottomContainer();
        this.initSelect();
        this.initContextMenu();
        this.initScriptEditor();
        this.resetEditor();
        this.checkUpdate();
        this.backupInterval();
        this.login();
        var _this = this;
        $.getJSON('config.json',function(data){
            _this.config = data;
            Parser.importPackages = ['java.util.','java.lang.'].concat((_this.config.autoImportPackage||'').replace(/\\s/g,'').replace(/\*/g,'').split(','));
        })
    },
    initSkin : function(){
        var skinSelector = $('.skin-selector');
        $('.button-skin').on('click',function(){
            skinSelector.toggle();
            return false;
        });
        var $body = $('body');
        $body.on('click',function(){
            skinSelector.hide();
        })
        var _this = this;
        skinSelector.on('click','li',function(){
            skinSelector.hide();
            $(this).siblings().each(function(){
                $body.removeClass('skin-' + $(this).text())
            })
            _this.setSkin($(this).text());
        })
    },
    login : function(){
        $('.loading-wrapper').remove();
        var _this = this;
        this.ajax({
            url : 'login',
            async : false,
            success : function(successed){
                if(!successed){
                    MagicEditor.createDialog({
                        title : '登录',
                        shade : true,
                        content : '<label style="width:80px;text-align: right;display: inline-block">用户名：</label><input type="text" name="username" autocomplete="off"/><div style="height:2px;"></div><label style="width:80px;text-align: right;display: inline-block">密码：</label><input type="password" name="password" autocomplete="off"/>',
                        replace : false,
                        allowClose : false,
                        autoClose : false,
                        buttons : [{
                            name : '登录',
                            click : function($dom){
                                var username = $dom.find('input[name=username]').val();
                                var password = $dom.find('input[name=password]').val();
                                var successed = false;
                                _this.ajax({
                                    url : 'login',
                                    data : {
                                        username : username,
                                        password : password
                                    },
                                    async : false,
                                    success : function(succ){
                                        successed = succ;
                                    }
                                })
                                if(!successed){
                                    _this.alert('登录','登录失败,用户名或密码不正确');
                                    return false;
                                }
                                _this.loadAPI();
                            }
                        }]
                    })
                }else{
                    _this.loadAPI();
                }
            }
        })
    },
    resetEditor : function(){
        $('input[name=group]').val('未分组');
        $('input[name=method]').val('GET');
        $('input[name=name]').val('');
        $('input[name=path]').val('');
        $('input[name=prefix]').val('');
        this.outputJson = null;
        this.apiId = null;
        this.scriptEditor&&this.scriptEditor.setValue('return message;');
        this.requestEditor && this.requestEditor.setValue(this.defaultRequestValue);
        this.resultEditor&&this.resultEditor.setValue('');
        this.optionsEditor && this.optionsEditor.setValue('{\r\n}');
    },
    addBreakPoint : function(line){
        var model = this.scriptEditor.getModel();
        model.deltaDecorations([],[{
            range : new monaco.Range(line, 1, line, 1),
            options: {
                isWholeLine: true,
                linesDecorationsClassName: 'breakpoints',
                className : 'breakpoint-line',
            }
        }])
    },
    removeBreakPoint : function(line){
        var model = this.scriptEditor.getModel();
        var decorations = [];
        if (line !== undefined) {
            decorations = model.getLineDecorations(line);
        } else {
            decorations = model.getAllDecorations();
        }
        var ids = [];
        for (var i=0,len =decorations.length;i<len;i++) {
            if (decorations[i].options.linesDecorationsClassName === 'breakpoints') {
                ids.push(decorations[i].id)
            }
        }
        model.deltaDecorations(ids, [])
    },
    hasBreakPoint : function(line){
        var decorations = this.scriptEditor.getLineDecorations(line);
        for (var i=0,len =decorations.length;i<len;i++) {
            if (decorations[i].options.linesDecorationsClassName === 'breakpoints') {
                return true;
            }
        }
    },
    renderApiList : function(){
        var empty = true;
        var root = [];
        var groups = {};
        var apiList = this.apiList;
        if(apiList&&apiList.length > 0){
            var $groupUL = $('input[name=group]').next();
            for(var i=0,len = apiList.length;i<len;i++){
                var info = apiList[i];
                info.groupName = info.groupName || '未分组';
                if(!groups[info.groupName]){
                    groups[info.groupName] = {
                        id : info.groupName,
                        children : [],
                        spread : true,
                        groupPrefix : info.groupPrefix,
                        title : info.groupName
                    }
                    if($groupUL.find('[data-name='+$.escapeSelector(info.groupName)+']').length == 0){
                        $groupUL.append($('<li data-name="'+info.groupName+'" data-prefix="'+(info.groupPrefix || '')+'"/>').append(info.groupName))
                    }
                }
                if(info.show!==false){
                    groups[info.groupName].children.push({
                        id : info.id,
                        groupName : info.groupName,
                        groupPrefix : info.groupPrefix,
                        name : info.name,
                        title : '<label style="padding-right: 4px;color:#000">' + info.name + "</label>" + info.path,
                        path : info.path
                    });
                }
            }
        }
        for(var key in this.addedGroups){
            if(!groups[key]){
                groups[key] = this.addedGroups[key];
            }
        }
        var $dom = $('.api-list-container').html('');
        for(var key in groups){
            var group = groups[key];
            var $item = $('<div/>').addClass('group-item')
                .addClass('opened')
                .append($('<div/>').addClass('group-header')
                    .append('<i class="iconfont icon-arrow-bottom"></i><i class="iconfont icon-list"></i>')
                    .append($('<label/>').append(key))
                    .append(group.groupPrefix ? '<span>('+group.groupPrefix+')</span>': '')
                );
            if(group.children){
                var $ul = $('<ul/>').addClass('group-list');
                for(var i =0,len = group.children.length;i<len;i++){
                    var info = group.children[i];
                    $ul.append($('<li/>').attr('data-id',info.id).append('<i class="iconfont icon-script"></i>')
                        .append('<label>'+info.name+'</label>')
                        .append('<span>('+info.path+')</span>'));
                }
                $item.append($ul);
            }
            $dom.append($item);
        }
    },
    loadAPI : function(id,isCopy){
        var _this = this;
        if(id){
            this.ajax({
                url : 'get',
                data : {
                    id : id
                },
                success : function(info){
                    _this.resetEditor();
                    $('.button-delete').removeClass('disabled');
                    if(isCopy === true){
                        $('input[name=name]').val();
                        $('input[name=path]').val();
                        MagicEditor.setStatusBar('复制接口：' + info.name + '(' + info.path + ')')
                    }else{
                        _this.apiId = id;
                        $('input[name=name]').val(info.name);
                        $('input[name=path]').val(info.path);
                        MagicEditor.setStatusBar('编辑接口：' + info.name + '(' + info.path + ')')
                    }
                    $('input[name=method]').val(info.method);
                    $('input[name=group]').val(info.groupName || '未分组');
                    $('input[name=prefix]').val(info.groupPrefix || '');
                    $('.button-run,.button-delete').removeClass('disabled');
                    _this.scriptEditor && _this.scriptEditor.setValue(info.script);
                    _this.requestEditor && _this.requestEditor.setValue(info.parameter || _this.defaultRequestValue);
                    _this.optionsEditor && _this.optionsEditor.setValue(info.option || '{\r\n}');

                }
            })
        }else{
            this.ajax({
                url : 'list',
                success : function(list){
                    _this.apiList = list;
                    _this.renderApiList();
                }
            })
        }
    },
    createNew : function($header){
        MagicEditor.createDialog({
            title : '新建接口',
            content : '新建接口会清空当前编辑器，是否继续？',
            buttons : [{
                name : '继续',
                click : function(){
                    $('.group-item .group-list li.selected').removeClass('selected');
                    MagicEditor.resetEditor();
                    $('.button-delete').addClass('disabled');
                    if($header){
                        $('input[name=group]').val($header.find('label').text());
                        var prefix = $header.find('span').text();
                        if(prefix){
                            $('input[name=prefix]').val(prefix.substring(1,prefix.length - 1));
                        }
                    }
                    MagicEditor.report('create_api');
                    MagicEditor.setStatusBar('创建接口');
                }
            },{
                name : '取消'
            }]
        })
    },
    setStatusBar : function(value){
        $('.footer-container').html(value);
    },
    initMTA : function(){
        window._mtac = {};
        var element = document.createElement("script");
        element.src = "//pingjs.qq.com/h5/stats.js?v2.0.4";
        element.setAttribute("name", "MTAH5");
        element.setAttribute("sid", "500724136");
        element.setAttribute("cid", "500724141");
        var s = document.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(element, s);
        var _this = this;
        element.onload = element.onreadystatechange = function(){
            if(!this.readyState||this.readyState=='loaded'||this.readyState=='complete') {
                _this.report('v0_4_8');
            }
        }

    },
    // 修改分组
    updateGroup : function($header){
        var _this = MagicEditor;
        var oldGroupName = $header.find('label').text();
        var oldPrefix = $header.find('span').text();
        oldPrefix = oldPrefix ? oldPrefix.substring(1,oldPrefix.length - 1) : '';
        _this.createDialog({
            title : '修改分组:' + oldGroupName,
            content : '<label>分组名称：</label><input type="text" name="name" value="'+oldGroupName+'" autocomplete="off"/><div style="height:2px;"></div><label>分组前缀：</label><input type="text" value="'+oldPrefix+'" name="prefix" autocomplete="off"/>',
            replace : false,
            buttons : [{
                name : '修改',
                click : function($dom){
                    var groupName = $dom.find('input[name=name]').val();
                    var groupPrefix = $dom.find('input[name=prefix]').val();
                    if(!groupName){
                        $dom.find('input[name=path]').focus();
                        return false;
                    }
                    var exists = false;
                    $('.group-header').each(function(){
                        if(this !== $header[0]){
                            var name = $(this).find('label').text();
                            if(name == groupName){
                                exists = true;
                                return false;
                            }
                        }
                    });
                    if(groupName.indexOf("'")!= -1 || groupName.indexOf('"') != -1){
                        _this.alert('创建分组','分组名不能包含特殊字符 \' "');
                        return false;
                    }
                    if(groupPrefix.indexOf("'")!= -1 || groupPrefix.indexOf('"') != -1){
                        _this.alert('创建分组','分组前缀不能包含特殊字符 \' "');
                        return false;
                    }
                    if(exists){
                        _this.alert('创建分组','分组已存在！');
                        return false;
                    }
                    _this.report('group_update');
                    _this.ajax({
                        url : 'group/update',
                        data : {
                            oldGroupName : oldGroupName,
                            groupName : groupName,
                            prefix : groupPrefix
                        },
                        success : function(){
                            if(_this.addedGroups[oldGroupName]){
                                delete _this.addedGroups[oldGroupName]
                            }
                            _this.addedGroups[groupName] = {
                                groupName : groupName,
                                groupPrefix : groupPrefix
                            }
                            var apiList = _this.apiList;
                            if(apiList&&apiList.length > 0){
                                for(var i=0,len = apiList.length;i<len;i++){
                                    if(apiList[i].groupName == oldGroupName){
                                        apiList[i].groupName = groupName;
                                        apiList[i].groupPrefix = groupPrefix || '';
                                    }
                                }
                            }
                            var $group = $('input[name=group]');
                            $group.next().find('li[data-name='+$.escapeSelector(oldGroupName)+']').attr('data-prefix',(groupPrefix || '')).attr('data-name',groupName).html(groupName);
                            if($group.val() == oldGroupName){
                                $group.val(groupName);
                                $('input[name=prefix]').val(groupPrefix);
                            }
                            $header.find('label').html(groupName).next().html(groupPrefix ? '('+groupPrefix+')' : '');
                            _this.renderApiList();
                        }
                    })
                }
            },{
                name : '取消'
            }]
        })
    },
    // 创建分组
    createGroup : function(){
        var _this = MagicEditor;
        _this.setStatusBar('创建分组..');
        MagicEditor.createDialog({
            title : '创建分组',
            content : '<label>分组名称：</label><input type="text" name="name" autocomplete="off"/><div style="height:2px;"></div><label>分组前缀：</label><input type="text" name="prefix" autocomplete="off"/>',
            replace : false,
            buttons : [{
                name : '创建',
                click : function($dom){
                    var groupName = $dom.find('input[name=name]').val();
                    var groupPrefix = $dom.find('input[name=prefix]').val();
                    if(!groupName){
                        $dom.find('input[name=path]').focus();
                        return false;
                    }
                    if(groupName.indexOf("'")!= -1 || groupName.indexOf('"') != -1){
                        _this.alert('创建分组','分组名不能包含特殊字符 \' "');
                        return false;
                    }
                    if(groupPrefix.indexOf("'")!= -1 || groupPrefix.indexOf('"') != -1){
                        _this.alert('创建分组','分组前缀不能包含特殊字符 \' "');
                        return false;
                    }
                    var exists = false;
                    $('.group-header').each(function(){
                        var name = $(this).find('label').text();
                        if(name == groupName){
                            exists = true;
                            return false;
                        }
                    });
                    if(exists){
                        _this.setStatusBar('分组「'+groupName + '」');
                        _this.alert('创建分组','分组已存在！');
                        return false;
                    }
                    _this.addedGroups[groupName] = {
                        groupName : groupName,
                        groupPrefix : groupPrefix
                    }
                    _this.report('group_create');
                    _this.setStatusBar('分组「'+groupName + '」创建成功');
                    $('input[name=group]').next().append($('<li data-name="'+groupName+'" data-prefix="'+(groupPrefix || '')+'"/>').append(groupName));
                    _this.renderApiList();
                }
            },{
                name : '取消'
            }]
        })
    },
    // 删除分组
    deleteGroup : function($header){
        var _this = MagicEditor;
        var groupName = $header.find('label').text();
        _this.setStatusBar('准备删除分组「'+groupName + '」');
        _this.createDialog({
            title : '删除接口分组',
            content : '是否要删除接口分组「'+groupName + '」',
            buttons : [{
                name : '删除',
                click : function(){
                    _this.report('group_delete');
                    var ids = [];
                    $header.next().find('li').each(function(){
                        ids.push($(this).data('id'));
                    });
                    _this.setStatusBar('准备删除接口分组「'+groupName + '」');
                    delete _this.addedGroups[groupName];
                    _this.ajax({
                        url : 'group/delete',
                        data : {
                            apiIds : ids.join(','),
                            groupName : groupName
                        },
                        success : function(){
                            _this.setStatusBar('接口分组「'+groupName + '」已删除');
                            _this.loadAPI();  //重新加载
                        }
                    })
                }
            },{
                name : '取消'
            }]
        })
    },
    report : function(eventId){
        try{
            MtaH5.clickStat(eventId);
        }catch(ignored){}
    },
    deleteApi : function($li){
        var text = $li.text();
        MagicEditor.createDialog({
            title : '删除接口',
            content : '是否要删除接口「'+text + '」',
            buttons : [{
                name : '删除',
                click : function(){
                    MagicEditor.setStatusBar('准备删除接口');
                    MagicEditor.report('script_delete')
                    var apiId = $li.data('id');
                    MagicEditor.ajax({
                        url : 'delete',
                        data : {
                            id : apiId
                        },
                        success : function(){
                            if(MagicEditor.apiId == apiId){
                                MagicEditor.apiId = null;
                            }
                            MagicEditor.setStatusBar('接口「'+text + '」已删除');
                            MagicEditor.loadAPI();  //重新加载
                        }
                    })
                }
            },{
                name : '取消'
            }]
        })
    },
    ajax : function(options){
        $.ajax({
            url : options.url,
            headers : options.headers,
            async : options.async,
            type : options.type || 'post',
            dataType : 'json',
            contentType : options.contentType,
            data : options.data,
            success : options.successd || function(json,data,xhr){
                if(json.code == 1){
                    options&&options.success(json.data,json,xhr);
                }else{
                    var val = options.exception&&options.exception(json.code,json.message,json);
                    if(val !== false){
                        MagicEditor.alert('Error',json.message);
                    }
                }
            },
            error : function(){
                MagicEditor.setStatusBar('ajax请求失败');
                MagicEditor.alert('网络错误','ajax请求失败');
                options.error&&options.error();
            }
        })
    },
    copyApi : function($li){
        var id = $li&&$li.data('id');
        id&&MagicEditor.confirm('复制接口','复制接口会清空当前编辑器，是否继续？',function(){
            MagicEditor.loadAPI(id,true);
        })
    },
    copyApiPath : function($li){
        var _this = MagicEditor;
        var path = $li&&$li.find('span').text();
        if(_this.config.web&&path){
            path = path.substring(1,path.length - 1);
            var prefix = $li.parent().prev().find('span').text() || '';
            if(prefix){
                prefix = prefix.substring(1,prefix.length - 1).replace(/(^\/+)|(\/+$)/g,'');
            }
            path = prefix + '/' + path.replace(/(^\/+)/g,'');
            if(_this.config&&_this.config.prefix){
                path = _this.config.prefix.replace(/(^\/+)|(\/+$)/g,'') + '/'+ path;
            }
            var host = location.href.substring(0,location.href.indexOf(_this.config.web)).replace(/(\/+$)/g,'');
            if(_this.config.prefix){
                host = host + '/' + _this.config.prefix.replace(/(^\/+)|(\/+$)/g,'');
            }
            path = host + '/' + path;
            try {
                var copyText = document.createElement('textarea');
                copyText.style = 'position:absolute;left:-99999999px';
                document.body.appendChild(copyText);
                copyText.innerHTML = path;
                copyText.readOnly = false;
                copyText.select();
                copyText.setSelectionRange(0, copyText.value.length);
                document.execCommand("copy");
                _this.alert('复制接口路径','复制成功');
            } catch (e) {
                _this.alert('复制接口路径失败，请手动赋值',path);
            }
        }
    },
    resetDebugContent : function(){
        $('.bottom-item-body table tbody').html('<tr><td colspan="3" align="center">no message.</td></tr>');
    },
    doContinue : function(step){
        if($('.button-continue').hasClass('disabled')){
            return;
        }
        if(this.debugSessionId){
            MagicEditor.resetDebugContent();
            $('.button-continue,.button-step-over').addClass('disabled');
            var _this = this;
            var headers = _this.requestHeaders || {};
            headers['Magic-Request-Session'] = this.debugSessionId;
            headers['Magic-Request-Continue'] = true;
            headers['Magic-Request-Breakpoints'] = this.getBreakPoints().join(',');
            headers['Magic-Request-Step-Into'] = step ? '1' : '0';
            this.ajax({
                url : _this.requestURL,
                type : _this.requestMethod,
                headers : headers,
                successd : function(json,status,xhr){
                    _this.convertResult(json,xhr);
                },
                error : function(){
                    $('.button-run').removeClass('disabled');
                }
            })
        }
    },
    paddingZero : function(val){
        if(val < 10){
            return '0' + val;
        }
        return val.toString();
    },
    getTimeStr : function(date){
        var month = date.getMonth() + 1;
        var day = date.getDate();
        var hour = date.getHours();
        var minute = date.getMinutes();
        var seconds = date.getSeconds();
        return date.getFullYear() + '-' + this.paddingZero(month) + '-' + this.paddingZero(day) + ' ' + this.paddingZero(hour) + ':' + this.paddingZero(minute) + ':'+this.paddingZero(seconds);
    },
    appendLog : function(level,message,throwable){

        var $div = $('<div class="output-log-line level-'+level+'"/>')
        $div.append($('<div class="timestamp"/>').append(this.getTimeStr(new Date())));
        $div.append($('<div class="level"/>').append(level.toUpperCase()));
        var messages = message.replace(/ /g,'&nbsp;').replace(/\t/g,'&nbsp;&nbsp;&nbsp;&nbsp;').split('\n');
        $div.append($('<div class="message"/>').append(messages[0]));
        if(messages.length > 1){
            for(var i=1;i<messages.length;i++){
                $div.append($('<div class="message-line level-'+level+'" />').append(messages[i]));
            }
        }
        if(throwable){
            messages = throwable.replace(/ /g,'&nbsp;').replace(/\t/g,'&nbsp;&nbsp;&nbsp;&nbsp;').split('\n');
            for(var i=0;i<messages.length;i++){
                $div.append($('<div class="message-line level-'+level+'" />').append(messages[i]));
            }
        }
        if(!this.$output){
            this.$output = $('.bottom-container .bottom-item-body.output');
        }
        this.$output.append($div);
        this.$output.scrollTop(this.$output[0].scrollHeight);
    },
    createConsole : function(callback){
        var _this = this;
        var source = new EventSourcePolyfill('console',{
            headers : _this.requestHeaders
        });
        source.onerror = function(){
            source.close();
        }
        source.addEventListener('create',function(e){
            _this.navigateTo(4);
            callback&&callback(e.data);
        })
        source.addEventListener('close',function(e){
            source.close();
        })
        source.addEventListener('log',function(e){
            var data = JSON.parse(e.data);
            _this.appendLog(data.level,data.message,data.throwable);
        })
    },
    getBreakPoints : function(){
        var decorations = MagicEditor.scriptEditor.getModel().getAllDecorations();
        var breakpoints = [];
        for (var i=0,len =decorations.length;i<len;i++) {
            if (decorations[i].options.linesDecorationsClassName === 'breakpoints') {
                breakpoints.push(decorations[i].range.startLineNumber);
            }
        }
        return breakpoints;
    },
    doTest : function(){
        var _this = this;
        if($('.button-run').hasClass('disabled')){
            return;
        }
        var prefix = $("input[name=prefix]").val();
        var path = $("input[name=path]").val();
        var host = location.href.substring(0,location.href.indexOf(_this.config.web)).replace(/(\/+$)/g,'');
        if(_this.config.prefix){
            host = host + '/' + _this.config.prefix.replace(/(^\/+)|(\/+$)/g,'');
        }
        var url = host + ('/' +prefix + '/' + path).replace(/\/+/g,'/');
        var request = _this.requestEditor.getValue();
        try{
            request = JSON.parse(request);
            _this.requestHeaders = request.header || {};
            delete request.header;
            if(typeof request != 'object'){
                _this.setStatusBar('请求参数有误！');
                _this.alert('运行测试','请求参数有误！');
                return;
            }
        }catch(e){
            _this.setStatusBar('请求参数有误！');
            _this.alert('运行测试','请求参数有误！');
            return;
        }
        if(request.path){
            for(var key in request.path){
                url = url.replace('{' + key + '}',request.path[key]);
            }
        }
        _this.setStatusBar('开始测试...');
        _this.createConsole(function(sessionId){
            _this.report('run');
            request.script = _this.scriptEditor.getValue();
            var breakpoints = _this.getBreakPoints();
            _this.requestHeaders['Magic-Request-Session'] = sessionId;
            _this.requestHeaders['Magic-Request-Breakpoints'] = breakpoints.join(',');
            _this.resetDebugContent();
            $('.button-run').addClass('disabled');
            $('.button-continue,.button-step-over').addClass('disabled');
            _this.requestMethod = $('input[name=method]').val();
            var isRequestBody = _this.requestMethod != 'GET' && request&&request.body&&(Array.isArray(request.body) || Object.getOwnPropertyNames(request.body).length >0);
            var requestData;
            if(isRequestBody){
                if(request.request){
                    var params = [];
                    for(var key in request.request){
                        params.push(key + '=' + request.request[key]);
                    }
                    if(params.length > 0){
                        url = url + "?" + params.join("&");
                    }
                }
            }else{
                requestData = request.request;
            }
            _this.requestURL = url;
            var contentType = isRequestBody ? 'application/json;charset=utf-8' : undefined;
            _this.ajax({
                url : _this.requestURL,
                type : _this.requestMethod,
                headers : _this.requestHeaders,
                data : isRequestBody ? JSON.stringify(request.body) : requestData,
                contentType : contentType,
                successd : function(json,status,xhr){
                    _this.convertResult(json,xhr);
                },
                error : function(){
                    $('.button-run').removeClass('disabled');
                }
            })
        });
    },
    doSave : function(){
        if($('.button-save').hasClass('disabled')){
            return;
        }
        $('.button-save').addClass('disabled');
        var name = $('input[name=name]').val();
        var path = $('input[name=path]').val();
        var method = $('input[name=method]').val();
        var groupName = $('input[name=group]').val();
        var groupPrefix = $('input[name=prefix]').val();
        this.setStatusBar('准备保存接口：' + name + "(" + path + ")");
        var _this = this;
        this.ajax({
            url : 'save',
            data : {
                script : this.scriptEditor.getValue(),
                path : path,
                method : method,
                id : this.apiId,
                groupName : groupName,
                groupPrefix : groupPrefix,
                parameter: this.requestEditor.getValue(),
                option: this.optionsEditor.getValue(),
                name : name,
                output : this.outputJson
            },
            async : false,
            exception : function(){
                $('.button-save').removeClass('disabled');
            },
            error : function(){
                $('.button-save').removeClass('disabled');
            },
            success : function(id){
                $('.button-save,.button-delete').removeClass('disabled');
                if(_this.apiId){
                    _this.report('script_save');
                    for(var i=0,len = _this.apiList.length;i<len;i++){
                        if(_this.apiList[i].id == _this.apiId){
                            _this.apiList[i].name = name;
                            _this.apiList[i].path = path;
                            _this.apiList[i].method = method;
                            _this.apiList[i].groupName = groupName;
                            break;
                        }
                    }
                }else{
                    _this.report('script_add');
                    _this.apiId = id;
                    _this.apiList.unshift({
                        id : id,
                        name : name,
                        path : path,
                        method : method,
                        groupName : groupName || '未分组',
                    })
                }
                _this.setStatusBar('保存成功！');
                _this.loadAPI();
            }
        })
    },
    convertResult : function(json,xhr){
        var outputJson;
        if(xhr && 'true' == xhr.getResponseHeader('Response-With-Magic-API')){
            var code = json.code;
            var message = json.message;
            this.debugSessionId = null;
            this.resetDebugContent();
            this.debugDecorations&&this.scriptEditor&&this.scriptEditor.deltaDecorations(this.debugDecorations,[]);
            this.debugDecorations = null;
            var _this = this;
            var ret = undefined;
            if(code === -1000){
                MagicEditor.setStatusBar('脚本执行出错..');
                MagicEditor.report('script_error');
                $(".button-run").removeClass('disabled');
                $('.button-continue,.button-step-over').addClass('disabled');
                this.navigateTo(2);
                if (json.body) {
                    var line = json.body;
                    var range = new monaco.Range(line[0], line[2], line[1], line[3] + 1);
                    var decorations = this.scriptEditor&&this.scriptEditor.deltaDecorations([],[{
                        range: range,
                        options : {
                            hoverMessage : {
                                value : message
                            },
                            inlineClassName : 'squiggly-error',
                        }
                    }])
                    this.scriptEditor.revealRangeInCenter(range);
                    this.scriptEditor.focus();
                    setTimeout(function(){
                        _this.scriptEditor&&_this.scriptEditor.deltaDecorations(decorations,[])
                    },10000)
                }
                ret = false;
            }else if(code === 1000){ // debug断点
                $(".button-run").addClass('disabled');
                $('.button-continue,.button-step-over').removeClass('disabled');
                this.navigateTo(3);
                this.debugIn(message, json.body);
                return false;
            }
            MagicEditor.setStatusBar('脚本执行完毕');
            $(".button-run").removeClass('disabled');
            $('.button-continue,.button-step-over').addClass('disabled');
            this.navigateTo(2)
            var contentType = xhr&&xhr.getResponseHeader('ma-content-type');
            if(contentType == 'application/octet-stream'){  //文件下载
                var disposition = xhr.getResponseHeader('ma-content-disposition');
                var filename = 'output';
                if(disposition){
                    filename = decodeURIComponent(disposition.substring(disposition.indexOf('filename=') + 9));
                }
                outputJson = this.formatJson({
                    filename : filename
                });
                var a = document.createElement("a");
                a.download = filename;
                var bstr = atob(json.data);
                var n = bstr.length;
                var u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                a.href = window.URL.createObjectURL(new Blob([u8arr]));
                a.click();
                MagicEditor.report('output_blob');
            }else if(contentType && contentType.indexOf('image') == 0){    //image开头
                outputJson = this.formatJson(json.data);
                this.createDialog({
                    title : '图片结果',
                    content : '<p align="center"><img  src="data:'+contentType+';base64,'+json.data+'"></p>',
                    replace : false,
                    buttons : [{name : 'OK'}]
                })
                MagicEditor.report('output_image');
            }else{
                outputJson = this.formatJson(json.data);
            }
        }else{
            this.navigateTo(2);
            outputJson = this.formatJson(json);
        }
        this.outputJson = outputJson;
        this.resultEditor.setValue(outputJson);
        return ret;
    },
    debugIn : function(id,data){
        MagicEditor.setStatusBar('进入断点...');
        MagicEditor.report('debug_in');
        this.debugSessionId = id;
        if(data.variables.length > 0){
            var $tbody = $('.bottom-item-body table tbody').html('');
            for(var i =0,len = data.variables.length;i<len;i++){
                var item = data.variables[i];
                var $tr = $('<tr/>');
                $tr.append($('<td/>').html(item.name))
                $tr.append($('<td/>').html(item.value))
                $tr.append($('<td/>').html(item.type))
                $tbody.append($tr);
            }
        }else{
            this.resetDebugContent();
        }
        this.debugDecorations = [this.scriptEditor&&this.scriptEditor.deltaDecorations([],[{
            range :  new monaco.Range(data.range[0],1,data.range[0],1),
            options: {
                isWholeLine: true,
                inlineClassName : 'debug-line',
                className : 'debug-line',
            }
        }])];
    },
    backupInterval : function(){
        var _this = this;
        var info = _this.getValue('api_info');
        if(info){
            info = JSON.parse(info);
            _this.apiId = info.id;
            $('input[name=name]').val(info.name || '');
            $('input[name=path]').val(info.path || '');
            $('input[name=method]').val(info.method || '');
            $('input[name=group]').val(info.groupName || '');
            $('input[name=prefix]').val(info.groupPrefix || '');
            _this.scriptEditor&&_this.scriptEditor.setValue(info.script || 'return message;');
            _this.requestEditor&&_this.requestEditor.setValue(info.parameters || _this.defaultRequestValue);
            _this.options&&_this.options.setValue(info.options || '{\r\n}');
            _this.output&&_this.output.setValue(info.options || '');

        }
        setInterval(function(){
            _this.setValue('api_info',{
                id : _this.apiId,
                name : $('input[name=name]').val(),
                path : $('input[name=path]').val(),
                method : $('input[name=method]').val(),
                groupName : $('input[name=group]').val(),
                groupPrefix : $('input[name=prefix]').val(),
                script : _this.scriptEditor&&_this.scriptEditor.getValue(),
                parameters : _this.requestEditor&&_this.requestEditor.getValue(),
                options : _this.optionsEditor&&_this.optionsEditor.getValue(),
                output: _this.outputEditor&&_this.outputEditor.getValue()
            })
        },5000)
    },
    // 初始化快捷键
    initShortKey : function(){
        var _this = this;
        $('body').on('keydown',function(e){
            if(e.keyCode == 119){ //F8
                _this.doContinue();
                e.preventDefault();
            }else if(e.keyCode == 117){ //F6
                _this.doContinue(true);
                e.preventDefault();
            }else if(e.keyCode == 81 && (e.metaKey || e.ctrlKey)){  //Ctrl + Q
                _this.doTest();
                e.preventDefault();
            }else if(e.keyCode == 83 && (e.metaKey || e.ctrlKey)){  //Ctrl + S
                _this.doSave();
                e.preventDefault();
            }else if(e.keyCode == 78 && e.altKey){  //Alt + N
                _this.createNew();
                e.preventDefault();
            }else if(e.keyCode == 71 && e.altKey){  //Alt + G
                _this.createGroup();
                e.preventDefault();
            }else if(e.keyCode == 27 || e.keyCode == 13){ //Enter or Esc
                $('.dialog-wrapper:not(.disabled-auto-close)').remove();
            }
        })
    },
    //检测更新
    checkUpdate : function(){
        var _this = this;
        var ignoreVersion = this.getValue('ignore-version');
        $.ajax({
            url : 'https://img.shields.io/maven-central/v/org.ssssssss/magic-api.json',
            dataType : 'json',
            success : function(data){
                if(data.value != 'v0.4.8'){
                    if(ignoreVersion != data.value){
                        _this.createDialog({
                            title : '更新提示',
                            content : '检测到已有新版本'+data.value+'，是否更新？',
                            buttons : [{
                                name : '更新日志',
                                click : function(){
                                    _this.setValue('ignore-version',data.value)
                                    window.open('http://www.ssssssss.org/changelog.html')
                                }
                            },{
                                name : '残忍拒绝',
                                click : function(){
                                    _this.setValue('ignore-version',data.value)
                                }
                            }]
                        })
                    }
                    MagicEditor.setStatusBar('版本检测完毕，最新版本为：' + data.value+',建议更新！！');
                }else{
                    MagicEditor.setStatusBar('版本检测完毕，当前已是最新版');
                }
            },
            error : function(){
                MagicEditor.setStatusBar('版本检测失败');
            }
        })
    },
    alert : function(title,content){
        this.createDialog({
            title : title,
            content : content,
            buttons : [{name : 'OK'}]
        });
    },
    confirm : function(title,content,callback){
        this.createDialog({
            title : title,
            content : content,
            buttons : [{name : '确定',click : function(){callback&&callback();}},{name : '取消'}]
        });
    },
    doShowHistory : function(){
        if(!this.apiId){
            this.alert('历史记录','请选择接口后在查看历史记录');
            return;
        }
        var _this = this;
        var apiId = this.apiId;
        var name = $('input[name=name]').val();
        var scriptModel = monaco.editor.createModel(this.scriptEditor.getValue(),'magicscript');
        _this.report('history_view');
        this.ajax({
            url : 'backups',
            data : {
                id : apiId
            },
            success : function(timestamps){
                if(timestamps.length == 0){
                    _this.alert('历史记录','暂无历史记录信息');
                    return;
                }
                var $ul = $('<ul class="not-select"/>')
                for(var i=0,len = timestamps.length;i<len;i++){
                    var timestamp = timestamps[i];
                    var timeStr = _this.getTimeStr(new Date(timestamp));
                    $ul.append($('<li/>').attr('data-timestamp',timestamp).attr('data-id',apiId).append(timeStr))
                }
                var html = $ul[0].outerHTML;
                html+= '<div class="version"><span class="version-time"></span><span class="current">当前版本</span></div>'
                html += '<div class="diff-editor"></div>';
                _this.setStatusBar('查看历史记录:' + (name || ''));
                _this.createDialog({
                    title : '历史记录：' + (name || ''),
                    content : html,
                    replace : false,
                    className : 'history-list',
                    buttons : [{
                        name : '恢复',
                        click : function(){
                            _this.scriptEditor.setValue(scriptModel.getValue());
                            _this.report('history_revert');
                            _this.setStatusBar('恢复历史记录:' + (name || ''));
                        }
                    },{
                        name : '取消'
                    }],
                    close : function(){
                      _this.diffEditor = null;
                    },
                    onCreate : function($dom){
                        _this.diffEditor = monaco.editor.createDiffEditor($dom.find('.diff-editor')[0], {
                            enableSplitViewResizing: false,
                            minimap : {
                                enabled : false
                            },
                            folding : false,
                            lineDecorationsWidth : 20,
                            fixedOverflowWidgets :false
                        });
                        _this.diffEditor.setModel({
                            original : scriptModel,
                            modified : scriptModel
                        });
                        var $version = $dom.find('.version-time');
                        $dom.on('click','ul li[data-timestamp]',function(){
                            $(this).addClass('selected').siblings().removeClass('selected');
                            var timestamp = $(this).data('timestamp');
                            $version.html($(this).text());
                            _this.ajax({
                                url : 'backup/get',
                                data : {
                                    id : apiId,
                                    timestamp : timestamp
                                },
                                success : function(info){
                                    _this.diffEditor.setModel({
                                        original : monaco.editor.createModel(info.script,'magicscript'),
                                        modified : scriptModel
                                    });
                                }
                            })
                        })
                    }
                })
            }
        })
    },
    //初始化右键菜单
    initContextMenu : function(){
        var _this = this;
        $('.api-list-container').on('contextmenu','.group-header',function(e){
            _this.createContextMenu([{
                name : '新建接口',
                shortKey : 'Alt+N',
                click : _this.createNew
            },{
                name : '刷新接口',
                shortKey : '',
                click : function (){_this.loadAPI()}
            },{
                name : '删除组',
                shortKey : '',
                click : _this.deleteGroup
            },{
                name : '新建分组',
                shortKey : 'Alt+G',
                click : _this.createGroup
            },{
                name : '修改分组',
                shortKey : '',
                click : _this.updateGroup
            }],e.pageX,e.pageY,$(this));
            return false;
        }).on('contextmenu','.group-list li',function(e){
            var $li = $(this);
            _this.createContextMenu([{
                name : '复制接口',
                shortKey : '',
                click : _this.copyApi,
            },{
                name : '复制路径',
                shortKey : '',
                click : _this.copyApiPath
            },{
                name : '刷新接口',
                shortKey : '',
                click : function (){_this.loadAPI()}
            },{
                name : '移动',
                shortKey : 'Ctrl+M',
                click : function(){
                    _this.alert('移动接口','功能暂未实现！');
                }
            },{
                name : '删除接口',
                shortKey : '',
                click : _this.deleteApi
            },{
                name : '新建分组',
                shortKey : 'Alt+G',
                click : _this.createGroup
            }],e.pageX,e.pageY,$li)
            return false;
        }).on('contextmenu',function(e){
            _this.createContextMenu([{
                name : '新建分组',
                shortKey : 'Alt+G',
                click : _this.createGroup
            }],e.pageX,e.pageY,$(this));
            return false;
        })
    },
    initSelect : function(){
        var _this = this;
        $('body').on('click','.select',function(){
            $('.select ul').hide();
            $(this).find('ul').show();
            return false;
        }).on('click','.select ul li',function(){
            var $this = $(this);
            var prefix = $this.data('prefix');
            if(prefix !== undefined){
                $('input[name=prefix]').val(prefix || '');
            }
            $this.parent().hide().parent().find('input').val($this.text());
            $this.addClass('selected').siblings().removeClass('selected');
            return false;
        }).on('click',function(){
            $('.select ul').hide();
        }).on('click','.api-list-container ul li',function(){
            $('.api-list-container ul li.selected').removeClass('selected');
            _this.loadAPI($(this).addClass('selected').data('id'))
        }).on('click','.button-run',function(){
            _this.doTest();
        }).on('click','.button-history',function(){
            _this.doShowHistory();
        }).on('click','.button-delete',function(){
            if($(this).hasClass('disabled')){
                return;
            }
            if(_this.apiId){
                var $li = $('.group-list li[data-id='+_this.apiId+']');
                if($li.length > 0){
                    _this.deleteApi($li);
                }
            }
        }).on('click','.button-save',function(){
            _this.doSave();
        }).on('click','.button-continue',function(){
            _this.doContinue();
        }).on('click','.button-step-over',function(){
            _this.doContinue(true);
        }).on('click','.button-gitee',function(){
            MagicEditor.report('button-gitee');
            window.open('https://gitee.com/ssssssss-team/magic-api');
        }).on('click','.button-github',function(){
            MagicEditor.report('button-github');
            window.open('https://github.com/ssssssss-team/magic-api')
        }).on('click','.button-qq',function(){
            window.open('https://shang.qq.com/wpa/qunwpa?idkey=10faa4cf9743e0aa379a72f2ad12a9e576c81462742143c8f3391b52e8c3ed8d')
        }).on('click','.button-help',function(){
            MagicEditor.report('button-help');
            window.open('https://ssssssss.org')
        });
    },
    getValue : function(key){
        return localStorage&&localStorage.getItem(key) || '';
    },
    setValue : function(key,value){
        if(Array.isArray(value) || typeof value == 'object'){
            value = JSON.stringify(value);
        }
        localStorage&&localStorage.setItem(key,value) || '';
    },
    removeValue : function(key){
        localStorage&&localStorage.removeItem(key);
    },
    bindEditorShortKey : function(editor){
        editor.addAction({
            id: "editor.action.triggerSuggest.extension",
            label: "触发代码提示",
            precondition: "!suggestWidgetVisible && !markersNavigationVisible && !parameterHintsVisible && !findWidgetVisible",
            run : function(){
                editor.trigger(null, 'editor.action.triggerSuggest', {})
            }
        })
        // Alt + / 代码提示
        editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.US_SLASH,function(){
            var triggerParameterHints = editor.getAction('editor.action.triggerParameterHints');
            var triggerSuggest = editor.getAction('editor.action.triggerSuggest.extension');
            triggerParameterHints.run().then(function(){
                setTimeout(function(){
                    if(triggerSuggest.isSupported()){
                        triggerSuggest.run();
                    }
                },0)
            });
        },'!findWidgetVisible && !inreferenceSearchEditor && !editorHasSelection');
        // Ctrl + Shift + U 转大写
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KEY_U,function(){
            editor.trigger(null, 'editor.action.transformToUppercase', {})
        });
        // Ctrl + Shift + X 转小写
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KEY_X,function(){
            editor.trigger(null, 'editor.action.transformToLowercase', {})
        });
        // Ctrl + Alt + L 代码格式化
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KEY_L,function(){
            editor.trigger(null, 'editor.action.formatDocument', {})
        },'editorHasDocumentFormattingProvider && editorTextFocus && !editorReadonly');
        // Ctrl + Alt + L 选中代码格式化
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KEY_L,function(){
            editor.trigger(null, 'editor.action.formatSelection', {})
        },'editorHasDocumentFormattingProvider && editorHasSelection && editorTextFocus && !editorReadonly');


    },
    // 初始化脚本编辑器
    initScriptEditor : function(){
        this.ajax({
            url: 'classes',
            async : false,
            success: function (data) {
                data = data || {};
                Parser.scriptClass = data.classes || {};
                Parser.extensions = data.extensions || {};
            }
        })
        $.get('classes.txt',function(txt){
            Parser.importClass = txt.split('\r\n');
        })
        monaco.editor.defineTheme('default', {
            base: 'vs',
            inherit: true,
            rules: [
                { background: '#ffffff' },
                { token: 'keywords', foreground: '000080',fontStyle : 'bold'},
                { token: 'number', foreground: '0000FF' },
                { token: 'keyword', foreground: '000080',fontStyle : 'bold'},
                { token: 'string.sql', foreground: '008000'},
                { token: 'predefined.sql', foreground: '000000'},
                { token: 'operator.sql', foreground: '000080',fontStyle : 'bold'},
                { token: 'key', foreground: '660E7A' },
                { token: 'string.key.json', foreground: '660E7A' },
                { token: 'string.value.json', foreground: '008000' },
                { token: 'keyword.json', foreground: '0000FF' },
                { token: 'string', foreground: '008000',fontStyle : 'bold' },
                { token: 'string.invalid', foreground: '008000' ,background : 'FFCCCC'},
                { token: 'string.escape.invalid', foreground: '008000' ,background : 'FFCCCC'},
                { token: 'string.escape', foreground: '000080',fontStyle : 'bold'},
                { token: 'comment', foreground: '808080'},
                { token: 'comment.doc', foreground: '808080'},
                { token: 'string.escape', foreground: '000080'}
            ],
            colors: {
                'editor.foreground': '#000000',
                'editor.background': '#ffffff',
//		        'editor.lineHighlightBorder' : '#00000000',
                'editorLineNumber.foreground': '#999999',	//行号的颜色
                'editorGutter.background' : '#f0f0f0',	//行号背景色
                'editor.lineHighlightBackground' : '#FFFAE3',	//光标所在行的颜色
                'dropdown.background' : '#F2F2F2',	//右键菜单
                'dropdown.foreground' : '#000000',	//右键菜单文字颜色
                'list.activeSelectionBackground': '#1A7DC4',	//右键菜单悬浮背景色
                'list.activeSelectionForeground' : '#ffffff',	//右键菜单悬浮文字颜色
            }
        });

        monaco.editor.defineTheme('dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { foreground: 'A9B7C6' },
                { token: 'keywords', foreground: 'CC7832',fontStyle : 'bold'},
                { token: 'keyword', foreground: 'CC7832',fontStyle : 'bold'},
                { token: 'number', foreground: '6897BB' },
                { token: 'string', foreground: '6A8759',fontStyle : 'bold' },
                { token: 'string.sql', foreground: '6A8759'},
                // { token: 'predefined.sql', foreground: 'A9B7C6'},
                { token: 'key', foreground: '9876AA' },
                { token: 'string.key.json', foreground: '9876AA' },
                { token: 'string.value.json', foreground: '6A8759' },
                { token: 'keyword.json', foreground: '6897BB' },
                { token: 'operator.sql', foreground: 'CC7832',fontStyle : 'bold'},
                { token: 'string.invalid', foreground: '008000' ,background : 'FFCCCC'},
                { token: 'string.escape.invalid', foreground: '008000' ,background : 'FFCCCC'},
                { token: 'string.escape', foreground: '000080',fontStyle : 'bold'},
                { token: 'comment', foreground: '808080'},
                { token: 'comment.doc', foreground: '629755'},
                { token: 'string.escape', foreground: 'CC7832'}
            ],
            colors: {
                'editor.background': '#2B2B2B',
//		        'editor.lineHighlightBorder' : '#00000000',
                'editorLineNumber.foreground': '#999999',	//行号的颜色
                'editorGutter.background' : '#313335',	//行号背景色
                'editor.lineHighlightBackground' : '#323232',	//光标所在行的颜色
                'dropdown.background' : '#3C3F41',	//右键菜单
                'dropdown.foreground' : '#BBBBBB',	//右键菜单文字颜色
                'list.activeSelectionBackground': '#4B6EAF',	//右键菜单悬浮背景色
                'list.activeSelectionForeground' : '#FFFFFF',	//右键菜单悬浮文字颜色
            }
        });
        var theme = this.getValue('skin') || 'default';
        this.report('theme_' + theme);
        this.scriptEditor = monaco.editor.create($('.editor-container')[0], {
            minimap : {
                enabled : false
            },
            language: 'magicscript',
            folding : true,
            lineDecorationsWidth : 35,
            wordWrap : 'on',
            theme : theme,
        })
        this.requestEditor = monaco.editor.create($('.request-editor')[0], {
            value: "{}",
            minimap : {
                enabled : false
            },
            language: 'json',
            folding : true,
            fixedOverflowWidgets :true,
            theme : theme
        })
        this.optionsEditor = monaco.editor.create($('.options-editor')[0], {
            value: "{}",
            minimap : {
                enabled : false
            },
            language: 'json',
            folding : true,
            fixedOverflowWidgets :true,
            theme : theme
        })
        this.resultEditor = monaco.editor.create($('.result-editor')[0], {
            value: "{}",
            minimap : {
                enabled : false
            },
            language: 'json',
            folding : true,
            readOnly : true,
            fixedOverflowWidgets : true,
            theme : theme,
            wordWrap : 'on'
        })
        var _this = this;
        this.scriptEditor.onMouseDown(function(e){
            if($(e.target.element).hasClass("codicon")){
                return;
            }
            if (e.target.detail && e.target.detail.offsetX && e.target.detail.offsetX >= 0 && e.target.detail.offsetX <= 90) {
                var line = e.target.position.lineNumber;
                if (_this.scriptEditor.getModel().getLineContent(line).trim() === '') {
                    return
                }
                if(_this.hasBreakPoint(line)){
                    _this.removeBreakPoint(line);
                }else{
                    _this.addBreakPoint(line);
                }
            }
        });
        this.bindEditorShortKey(this.scriptEditor);
        this.bindEditorShortKey(this.requestEditor);
        this.bindEditorShortKey(this.optionsEditor);
    },
    navigateTo : function(index){
        var $parent = $('.bottom-container');
        var $dom = $parent.find('.bottom-content-container').show();
        $parent.find('.bottom-tab li').eq(index).addClass('selected').siblings().removeClass('selected');
        $dom.find('.bottom-content-item').eq(index).show().siblings('.bottom-content-item').hide();
        this.layout();
    },
    createDialog : function(options){
        options = options || {};
        var $dialog = $('<div/>').addClass('dialog');
        if(options.className){
            $dialog.addClass(options.className);
        }
        var $header = $('<div/>').addClass('dialog-header').addClass('not-select').append(options.title || '');
        if(options.allowClose !== false){
            var $close = $('<span/>').append('<i class="iconfont icon-close"></i>');
            $header.append($close);
            $close.on('click',function(){
                if(options.close&&options.close()){
                    return;
                }
                $wrapper.remove();
            })
        }
        $dialog.append($header);
        var content = options.content || '';
        if(options.replace !== false){
            content = content.replace(/\n/g,'<br>').replace(/ /g,'&nbsp;').replace(/\t/g,'&nbsp;&nbsp;&nbsp;&nbsp;');
        }

        $dialog.append('<div class="dialog-content">' + content + '</div>');
        var buttons = options.buttons || [];
        var $buttons = $('<div/>').addClass('dialog-buttons').addClass('not-select');
        if(buttons.length > 1){
            $buttons.addClass('button-align-right');
        }
        for(var i=0,len = buttons.length;i<len;i++){
            var button = buttons[i];
            $buttons.append($('<button/>').html(button.name || '').addClass(button.className || '').addClass(i == 0 ? 'active' : ''));
        }
        $dialog.append($buttons);
        var $wrapper = $('<div/>').addClass('dialog-wrapper').append($dialog);
        if(!options.autoClose){
            $wrapper.addClass("disabled-auto-close")
        }
        if(options.shade){
            $wrapper.addClass("shade")
        }
        $buttons.on('click','button',function(){
            var index = $(this).index();
            if(buttons[index].click&&buttons[index].click($dialog) === false){
                return;
            }
            options.close&&options.close();
            $wrapper.remove();
        })
        $('body').append($wrapper);
        options.onCreate&&options.onCreate($wrapper);
    },
    createContextMenu : function(menus,left,top,$dom){
        $('.context-menu').remove();
        var $ul = $('<ul/>').addClass('context-menu').addClass('not-select');
        for(var i=0,len = menus.length;i<len;i++){
            var menu = menus[i];
            $ul.append($('<li/>').append('<label>'+menu.name+'</label>').append('<span>'+(menu.shortKey || '')+'<span>'));
        }
        $ul.on('click','li',function(){
            var menu = menus[$(this).index()]
            menu&&menu.click&&menu.click($dom);
        });
        $ul.css({
            left : left + 'px',
            top : top + 'px'
        })
        $('body').append($ul).on('click',function(){
            $ul.remove();
        });
    },
    // 初始化左侧工具条
    initLeftToobarContainer : function(){
        var $apiContainr = $('.api-list-container');
        var value = this.getValue('left-toolbar-width');
        if(value && !isNaN(Number(value))){
            $apiContainr.width(value);
        }
        if('false' == this.getValue('left-toolbar-show')){
            $('.left-toolbar-container li').removeClass('selected');
            $apiContainr.hide();
        }
        var _this = this;
        $('.left-toolbar-container').on('click','li',function(){
            var $this = $(this);
            if($this.hasClass('selected')){	//当前是选中状态
                $this.removeClass('selected');
                _this.setValue('left-toolbar-show',false);
                $apiContainr.hide();
            }else{
                $this.addClass('selected');
                _this.setValue('left-toolbar-show',true);
                $apiContainr.show();
            }
            _this.layout();
        })
        var $middleContainer = $('.middle-container');
        // 调整宽度
        var resizer = $middleContainer.find('.resizer-x')[0];
        resizer.onmousedown = function(){
            var box = $apiContainr[0].getClientRects()[0];
            document.onmousemove = function(e){
                var move = e.clientX - 22;
                if(move > 150 && move < 700){
                    _this.layout();
                    _this.setValue('left-toolbar-width',move);
                    $apiContainr.width(move);
                }
            }
            document.onmouseup = function(evt){
                document.onmousemove = null;
                document.onmouseup = null;
                resizer.releaseCapture && resizer.releaseCapture();
            }
            resizer.setCapture && resizer.setCapture();
        }

        $('body').on('click','.group-header',function(){
            var $parent = $(this).parent();
            if($parent.hasClass('opened')){
                $parent.removeClass('opened');
                $(this).find('.icon-arrow-bottom').removeClass('icon-arrow-bottom').addClass('icon-arrow-right');
            }else{
                $parent.addClass('opened');
                $(this).find('.icon-arrow-right').removeClass('icon-arrow-right').addClass('icon-arrow-bottom');
            }
        })
    },
    formatJson : function (val, defaultVal) {
        return (val ? JSON.stringify(val, null, 4) : defaultVal) || '';
    },
    // 初始化底部
    initBottomContainer : function(){
        var $contentContainer = $('.bottom-container .bottom-content-container');
        var value = this.getValue('bottom-container-height');
        if(value && !isNaN(Number(value))){
            $contentContainer.height(value);
        }
        if('false' == this.getValue('bottom-tab-show')){
            $contentContainer.hide();	//隐藏全部
            $('.bottom-container .bottom-tab li').removeClass('selected');
        }else{
            var index = Number(this.getValue('bottom-tab-index'));
            if(!isNaN(index)){
                this.navigateTo(index);
            }
        }
        var _this = this;
        $('.bottom-container').on('click','.bottom-tab li',function(){
            var $this = $(this);
            if($this.hasClass('selected')){	//当前是选中状态
                $contentContainer.hide();	//隐藏全部
                $this.removeClass('selected')
                _this.setValue('bottom-tab-show',true);
            }else{
                $this.addClass('selected').siblings().removeClass('selected');	//选中选择项，取消其他选择项
                var index = $(this).index();
                _this.setValue('bottom-tab-index',index);
                _this.setValue('bottom-tab-show',true);
                $contentContainer.show().find('.bottom-content-item').hide().eq(index).show();
            }
            _this.layout();
        }).on('click','.button-minimize',function(){
            _this.setValue('bottom-tab-show',false);
            $contentContainer.hide();	//隐藏全部
            $('.bottom-tab li').removeClass('selected');
            _this.layout();
        });
        // 调整底部高度
        var resizer = $contentContainer.find('.resizer-y')[0];
        resizer.onmousedown = function(){
            var box = $contentContainer[0].getClientRects()[0];
            document.onmousemove = function(e){
                if(e.clientY > 150){
                    var move = box.height - (e.clientY - box.y);
                    if(move > 30){
                        _this.setValue('bottom-container-height',move);
                        _this.layout();
                        $contentContainer.height(move);
                    }
                }
            }
            document.onmouseup = function(evt){
                document.onmousemove = null;
                document.onmouseup = null;
                resizer.releaseCapture && resizer.releaseCapture();
            }
            resizer.setCapture && resizer.setCapture();
        }
        $('.bottom-container').on('click','.bottom-content-item:eq(0) .button-clear',function(){
            _this.requestEditor&&_this.requestEditor.setValue('{}');
        }).on('click','.bottom-content-item:eq(0) .button-format',function(){
            try{
                _this.requestEditor.setValue(_this.formatJson(JSON.parse(_this.requestEditor.getValue()),'{\r\n}'));
            }catch(e){}
        }).on('click','.bottom-content-item:eq(1) .button-clear',function(){
            _this.optionsEditor&&_this.optionsEditor.setValue('{}');
        }).on('click','.bottom-content-item:eq(1) .button-format',function(){
            try{
                _this.optionsEditor.setValue(_this.formatJson(JSON.parse(_this.optionsEditor.getValue()),'{\r\n}'));
            }catch(e){}
        }).on('click','.bottom-content-item:eq(2) .button-clear',function(){
            _this.resultEditor&&_this.resultEditor.setValue('{}');
        }).on('click','.bottom-content-item:eq(2) .button-format',function(){
            try{
                _this.resultEditor.setValue(_this.formatJson(JSON.parse(_this.resultEditor.getValue()),'{\r\n}'));
            }catch(e){}
        }).on('click','.bottom-content-item:eq(4) .button-clear',function(){
            $('.bottom-container .bottom-item-body.output').html('')
        })
    },
    setSkin : function(skin){
        $('body').addClass('skin-' + skin);
        this.setValue('skin',skin);
        monaco.editor.setTheme(skin);
        MagicEditor.report('theme_' + skin);
        MagicEditor.setStatusBar('切换皮肤至：' + skin);
        //this.scriptEditor&&this.scriptEditor.setTheme(skin);
    },
    layout : function(){
        this.scriptEditor&&$(this.scriptEditor.getDomNode()).is(":visible")&&this.scriptEditor.layout();
        this.optionsEditor&&$(this.optionsEditor.getDomNode()).is(":visible")&&this.optionsEditor.layout();
        this.requestEditor&&$(this.requestEditor.getDomNode()).is(":visible")&&this.requestEditor.layout();
        this.resultEditor&&$(this.resultEditor.getDomNode()).is(":visible")&&this.resultEditor.layout();
        this.diffEditor&&$(this.diffEditor.getDomNode()).is(":visible")&&this.diffEditor.layout();
    }
}
$(function(){
    require(['vs/editor/editor.main'],function(){
        MagicEditor.init();
    })
    $(window).resize(function(){
        MagicEditor.layout();
    });

});
