function TangleEval(s) { return eval(s); }  // hack to make Firefox's error line numbers correct
//
//  Tangle.js
//  Tangle
//
//  Created by Bret Victor on 5/2/10.
//
//  ------ initial setup ------
//
//  var tangle = new Tangle();
//
//  tangle.formatters.format_foo = function (value) { return foo(value); }
//  tangle.views.v_foo = function (value, element, worksheet) { ... }  // called whenever value changes
//  tangle.controls.c_foo = function (element, worksheet) { ... }  // called once to initialize element
//
//  ------ constants (and tables) ------
//
//  tangle.addConstant("radius_of_earth", 6.38e6, "from <a href="http://google.com">here</a>");
//  tangle.addConstants( { radius_of_earth: { value:6.38e6, description:"from <a href="http://google.com">here</a>" },
//                       { radius_of_moon:  { value:1.73e6, description:"from <a href="http://google.com">here</a>" } );
//
//  var constants = tangle.getConstants();   // returns { radius_of_earth:6.38e6, radius_of_moon:1.73e6 }
//  var value = tangle.getConstant(constantName);
//  var html = tangle.getConstantDescription(constantName);
//
//  ------ worksheets ------
//
//  var worksheet = tangle.addWorksheet(sheetName, sheetElement, script);
//  var worksheet = tangle.getWorksheet(sheetName);
//
//  var error = worksheet.setScript(script);
//
//  var variableName = worksheet.getVariableName(element);
//  var value = worksheet.getValue(element);
//  var value = worksheet.getValue(variableName);
//
//  worksheet.setValue(element, value);
//  worksheet.setValue(variableName, value);
//
//  worksheet.setView(element, function (value, element, worksheet) { .... });  // called whenever value changes
//

Tangle = function () {

	var tangle = this;
	
	tangle.formatters = new Hash;
	tangle.views = new Hash;
	tangle.controls = new Hash;

	tangle.variablePrefix = "a_";
	tangle.constantPrefix = "k_";
	tangle.tablePrefix = "table_";

	tangle.log = function (msg) { if (window.console) window.console.log(msg); }
	
	
	//----------------------------------------------------------
	//
	// worksheet
	
	var worksheets = new Hash;
	
	tangle.getWorksheet = function (name) {
		if (typeof(name) != "string") { return name.retrieve("tangleWorksheet"); }  // name is actually an element
		var worksheet = worksheets[name];
		if (!worksheet) { tangle.log("unknown worksheet: " + name); }
		return worksheet;
	};
	
	tangle.addWorksheet = function (name, rootElement, script) {
	
		var model = new Hash;
		var settersForClass = new Hash;
		
		var worksheet = {
			name: name,
			element: rootElement,
			model: model,
			
			getVariableName: getVariableName,
			getValue: getValue,
			setValue: setValue,
			setView: setView,
			setScript: setScript,
		};
		
		worksheets[name] = worksheet;
		rootElement.store("tangleWorksheet", worksheet);
		
		initializeControls();
		initializeConstants();
		setScript(script);  // initialize and update model
		
		return worksheet;
		

		//----------------------------------------------------------
		//
		// controls
		
		function initializeControls() {
			tangle.controls.each( function (controlFunc, controlName) {
				rootElement.getElements("." + controlName).each(function (controlElement) {
					controlFunc(controlElement, worksheet);
				});
			});
		}

		//----------------------------------------------------------
		//
		// constants
		
		function initializeConstants() {
			stopDeferringConstants();
			constantInfos.each(function (info, name) {
				var prefix = (info.value.length === undefined) ? tangle.constantPrefix : tangle.tablePrefix;
				var elements = rootElement.getElements("." + prefix + name);
				elements.each( function (el) { el.store("tangleConstantName", name); });
				setValueForElementsWithClass(prefix + name, info.value);
			});
		}

		function getConstantName(el) {
			return el.retrieve("tangleConstantName");
		}

		//----------------------------------------------------------
		//
		// variables

		function getVariableName(el) {
			var cacheKey = "tangleVariableName";
			var name = el.retrieve(cacheKey);
			if (name) { return name; }
			
			var classNames = el.className.split(" ");
			for (var i=0 ; i < classNames.length; i++) {
				var className = classNames[i];
				if (className.indexOf(tangle.variablePrefix) == 0) {
					name = className.substr(tangle.variablePrefix.length);
					el.store(cacheKey, name);
					return name;
				}
			}
			
			tangle.log("no variable name for element with class " + el.className);
			return undefined;
		}

		function getValue(name) {
			if (typeof(name) != "string") {  // name is actually an element
				var constantName = getConstantName(name);
				if (constantName) { return tangle.getConstant(constantName); }
				name = getVariableName(name);
			}
			var value = model[name];
			if (value === undefined) { tangle.log("unknown variable: " + name);  return 0; }
			return value;
		}

		function setValue(name, value) {
			if (typeof(name) != "string") { name = getVariableName(name); }  // name is actually an element
			var oldValue = model[name];
			if (oldValue === undefined) { tangle.log("trying to set unknown variable: " + name);  return; }
			if (oldValue === value) { return; }  // don't update if new value is the same
			
			model[name] = value;
			setValueForElementsWithClass(tangle.variablePrefix + name, value);

			updateModel();
		}
		
		//----------------------------------------------------------
		//
		// model

		function setScript(script) {
			var constants = new Hash;
			var tables = new Hash;
			constantInfos.each( function(info, name) {
				if (info.value.length !== undefined) { tables[name] = info.value; }
				else { constants[name] = info.value; }
			});
			
			var fullSource = "(function (constants, tables) { " + script +
			                 "\nreturn { initialize:initialize, update:update };\n})";
			try {
				var updaterGenerator = TangleEval(fullSource);
				worksheet.updater = updaterGenerator(constants, tables);
			}
			catch (error) {
				logScriptError(error);
				return error;
			}

			worksheet.script = script;
			var error = updateModel(true);  // initialize and update
			
			return error;
		}
		
		function updateModel(shouldInitialize) {
			if (!worksheet.updater) { return; }
			
			var ShadowModel = function () {};
			ShadowModel.prototype = model;
			var shadowModel = new ShadowModel;
			
			try {
				if (shouldInitialize) { worksheet.updater.initialize(shadowModel); }
				worksheet.updater.update(shadowModel);
			}
			catch (error) {
				logScriptError(error);
				return error;
			}
			
			shadowModel.each(function (value, variableName) {
				model[variableName] = value;
			});

			shadowModel.each(function (value, variableName) {
				setValueForElementsWithClass(tangle.variablePrefix + variableName, value);
			});
			
			return null;  // no error
		}
		
		function logScriptError(error) {
			var filename = error.sourceURL ? error.sourceURL.split("/").getLast() : undefined;
			var lineNumber = error.line || error.lineNumber;
			var message = error.message || error.toString();
			tangle.log("error in script of worksheet " + name + 
					  (filename ? (", " + filename) : "") +
			          (lineNumber ? (", line " + lineNumber) : "") + ": " + message);
		}
		
		//----------------------------------------------------------
		//
		// update elements

		function setValueForElementsWithClass(clas, value) {
			if (!settersForClass[clas]) {  // cache setters if we haven't yet
				var isTable = (value.length !== undefined);
				var elements = rootElement.getElements("." + clas);
				
				settersForClass[clas] = elements.map(function (el) {
					var setter = getSetterForElement(el);
					if (!isTable) { return setter; }
					var index = getTableIndexForElement(el);
					return function (value) { setter(value[index]); }
				});
			}
			settersForClass[clas].each( function (setter) {
				setter(value);
			});
		}
		
		function setView(el, func) {
			el.store("tangleElementView", func);
		}

		function getSetterForElement(el) {
			var elementView = el.retrieve("tangleElementView");
			if (elementView) {
				return function (value) { elementView(value, el, worksheet); }
			}
		
			var classNames = el.className.split(" ");
			for (var i=0 ; i < classNames.length; i++) {
				var className = classNames[i];
		
				var view = tangle.views[className];
				if (view) {
					return function (value) { view(value, el, worksheet); }
				}
				
				var formatter = tangle.formatters[className];
				if (formatter) {
					return getFormattedTextSetterForElement(el, formatter);
				}
			}
			
			return getFormattedTextSetterForElement(el, function (value) { return value; });
		}
		
		function getFormattedTextSetterForElement(el, formatter) {
			var span = el.getElement(".tangleDynamicValue");
			if (!span) { span = (new Element("span", { "class": "tangleDynamicValue" })).inject(el, "top"); }

			return function (value) { span.set("text", formatter(value)); }
		}

		function getTableIndexForElement(el) {
			var prefix = "index_";
			var classNames = el.className.split(" ");
			for (var i=0; i < classNames.length; i++) {
				if (classNames[i].indexOf(prefix) == 0) { return classNames[i].substr(prefix.length).toInt(); }
			}
			return -1;
		}
	};


	//----------------------------------------------------------
	//
	// constant accessors

	var constantInfos = new Hash;  // { myConstant: { value:17, description:"mama told me" } }

	tangle.getConstants = function () {
		stopDeferringConstants();
		return constantInfos.map( function (info) { return info.value; });
	}
		
	tangle.getConstant = function (name) {
		return getConstantInfo(name).value || 0;
	}

	tangle.getConstantDescription = function (name) {
		return getConstantInfo(name).description || "";
	}

	tangle.getConstantDependencies = function (name) {
		return getConstantInfo(name).dependencies || [];
	}

	function getConstantInfo (name) {
		stopDeferringConstants();
		var info = constantInfos[name];
		if (!info) { tangle.log("unknown constant: " + name);  return {}; }
		return info;
	}


	//----------------------------------------------------------
	//
	// constant constructors

	var shouldDeferAddedConstants = true;  // wait until all constants have been added
	var deferredConstants = new Hash;

	function stopDeferringConstants() {
		if (!shouldDeferAddedConstants) { return; }
		shouldDeferAddedConstants = false;
		tangle.addConstants(deferredConstants);
		deferredConstants.empty();
	}

	tangle.addConstant = function (name, value, description) {
		var hash = {};
		hash[name] = { value:value, description:description };
		tangle.addConstants(hash);
	};
	
	tangle.addConstants = function (newConstants) {
		if (shouldDeferAddedConstants) {
			deferredConstants.extend(newConstants);
			return;
		}
		
		var dependenciesForDerivedConstants = new Hash;

		$H(newConstants).each( function (value, name) {
			if (typeof(value) == "object") {
				constantInfos[name] = value;
			}
			else if (typeof(value) == "number") {
				constantInfos[name] = { value:value, description:"" };
			}
			else if (typeof(value) == "function") {
				dependenciesForDerivedConstants[name] = getDependenciesForDerivedConstant(value);
			}
		});
		
		// resolve derived constants
		
		while (true) {
			var resolvedCount = 0;  // number of constants resolved on this iteration
			
			dependenciesForDerivedConstants.each(function (dependencies, name) {
				if (constantInfos[name]) { return; }   // already resolved this constant
				
				var canResolve = true;
				dependencies.each( function (referencedName) {
					if (!constantInfos[referencedName]) { canResolve = false; }
				});
				
				if (canResolve) {
					var value = newConstants[name](tangle.getConstant);
					var description = "";   // concatenate the descriptions of the dependencies
					dependencies.each( function (referencedName) {
						if (description.length) { description += "<br/>\n"; }
						description += constantInfos[referencedName].description;
					});
					constantInfos[name] = { value:value, description:description, dependencies:dependencies };
					resolvedCount++;
				}
			});
			
			if (resolvedCount == 0) {
				// write an error message for derived constants that didn't resolve
				dependenciesForDerivedConstants.each(function (dependencies, name) {
					if (constantInfos[name]) { return; }
					dependencies.each( function (referencedName) {
						if (!constantInfos[referencedName]) {
							tangle.log('could not resolve constant "' + name + 
							           '" because "' + referencedName + '" was never defined.');
						}
					});
					constantInfos[name] = { value:0, description:"" };
				});
				break;
			}
		}
		
		function getDependenciesForDerivedConstant (f) {
			var referencedConstantNames = new Hash;
			
			// record the other constants that this function references
			
			var k = function (referencedName) {
				referencedConstantNames[referencedName] = true;
				var constantInfo = constantInfos[referencedName];
				return constantInfo ? constantInfo.value : 0;
			}

			f(k);  // ignore the return value, but record the references
			
			return referencedConstantNames.getKeys();
		}
	};

};
