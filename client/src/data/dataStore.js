import excelExport from "./excelExport";
import FileSaver from "file-saver";

class DataStore {
  constructor(database) {
    this._database = database;

    this.users = [];
    this.endpoints = [];
    this.questions = [];

    this._usersMap = {};
    this._questionsMap = {};
    this._questionsValueMap = {};
    this._endpointsMap = {};
    this._workshopsMap = {};
    this._responsesMap = {};

    this._usersLoaded = false;
    this._endpointsLoaded = false;
    this._questionsLoaded = false;
    this._workshopsLoaded = {};
    this._responsesLoaded = {};
  }

  async _loadQuestions() {
    // TODO: Handle errors
    if (this._questionsLoaded === true) return;

    let questions = await this._database.loadQuestions();
    for (let question of questions) {
      this.questions.push(question);
      this._questionsMap[String(question.id)] = question;
      let valueMap = (this._questionsValueMap[String(question.id)] = {});
      if (question.t === "c") {
        for (let value of question.v) {
          valueMap[value.v] = value.d;
        }
      }
    }

    this._questionsLoaded = true;
  }

  async _loadEndpoints() {
    // TODO: Handle errors
    if (this._endpointsLoaded === true) return;

    let endpoints = await this._database.loadEndpoints();
    for (let endpoint of endpoints) {
      this.endpoints.push(endpoint);
      this._endpointsMap[String(endpoint.id)] = endpoint;
    }

    this._endpointsLoaded = true;
  }

  async _loadWorkshops(endpointId) {
    // TODO: Handle errors
    await this._loadEndpoints();
    if (this._workshopsLoaded[endpointId] === true) return;

    let workshops = await this._database.loadWorkshops(endpointId);

    let workshopsMapObject = (this._workshopsMap[endpointId] = {});
    let responsesMapObject = (this._responsesMap[endpointId] = {});
    let workshopsArray = this._endpointsMap[endpointId].w;
    for (let workshop of workshops) {
      workshopsArray.push(workshop);
      workshopsMapObject[String(workshop.id)] = workshop;
      responsesMapObject[String(workshop.id)] = {};
    }

    this._workshopsLoaded[endpointId] = true;
    this._responsesLoaded[endpointId] = {};
  }

  async _loadResponses(endpointId, workshopId) {
    // TODO: Handle errors
    await this._loadEndpoints();
    await this._loadWorkshops(endpointId);
    if (
      this._responsesLoaded[endpointId] != null &&
      this._responsesLoaded[endpointId][workshopId] === true
    )
      return;

    let allResponses = await this._database.loadResponses(
      endpointId,
      workshopId
    );

    // Forma In: { person: { question: { type: value } } }
    // Forma Out: [ { person: person, responses: [ { question: { type: value } } ] } }
    let responsesEndpointWorkshop = this._responsesMap[endpointId][workshopId];
    let workshopsEndpointWorkshop = this._workshopsMap[endpointId][workshopId];
    workshopsEndpointWorkshop.r = [];
    for (let personId of Object.keys(allResponses)) {
      let output = {
        p: personId,
        r: []
      };
      workshopsEndpointWorkshop.r.push(output);

      let personResponses = allResponses[personId];
      responsesEndpointWorkshop[personId] = personResponses;

      for (let questionId of Object.keys(personResponses)) {
        let responses = personResponses[questionId];

        let outputPre = {
          q: questionId,
          t: "PRE",
          v: responses["PRE"],
          id: personId + "PRE" + questionId
        };
        let outputPost = {
          q: questionId,
          t: "POST",
          v: responses["POST"],
          id: personId + "POST" + questionId
        };

        output.r.push(outputPre);
        output.r.push(outputPost);
      }
    }

    if (this._responsesLoaded[endpointId] == null) {
      this._responsesLoaded[endpointId] = { workshopId: true };
    } else {
      this._responsesLoaded[endpointId][workshopId] = true;
    }
  }

  async _loadUsers() {
    // TODO: Handle errors
    // TODO: Add live listeners
    if (this._usersLoaded === true) return;

    let users = await this._database.loadUsers();
    for (let user of users) {
      this.users.push(user);
      this._usersMap[String(user.id)] = user;
    }

    this._usersLoaded = true;
  }

  async exportEndpoints(options, questions, endpointIds) {
    let workshops = [];
    for (let endpointId of endpointIds) {
      for (let workshop of await this.getWorkshops(endpointId)) {
        workshops.push(workshop);
        await this._loadResponses(endpointId, workshop.id);
      }
    }

    let blob = new Blob(
      [await excelExport.exportWorkshops(options, questions, workshops)],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    );
    FileSaver.saveAs(blob, "kiri_export.xlsx");
  }

  async exportWorkshops(options, questions, endpointId, workshopIds) {
    let workshops = [];
    for (let workshopId of workshopIds) {
      workshops.push(await this.getWorkshopByID(endpointId, workshopId));
      await this._loadResponses(endpointId, workshopId);
    }

    let blob = new Blob(
      [await excelExport.exportWorkshops(options, questions, workshops)],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    );
    FileSaver.saveAs(blob, "kiri_export.xlsx");
  }

  async getEndpoints() {
    await this._loadEndpoints();
    return this.endpoints;
  }

  async getEndpointByID(endpointId) {
    await this._loadEndpoints();
    return this._endpointsMap[endpointId];
  }

  async getWorkshops(endpointId) {
    await this._loadWorkshops(endpointId);
    return this._endpointsMap[endpointId].w;
  }

  async getWorkshopByID(endpointId, workshopId) {
    await this._loadWorkshops(endpointId);
    let workshopMap = this._workshopsMap[endpointId];
    return workshopMap != null ? workshopMap[workshopId] : undefined;
  }

  async getQuestions() {
    await this._loadQuestions();
    return this.questions;
  }

  async getQuestionByID(questionId) {
    await this._loadQuestions();
    return this._questionsMap[questionId];
  }

  async getQuestionValueDescriptionByID(questionId, value) {
    await this._loadQuestions();
    let questionValues = this._questionsValueMap[questionId];
    return questionValues != null ? questionValues[value] : undefined;
  }

  async getResponses(endpointId, workshopId) {
    await this._loadResponses(endpointId, workshopId);
    return this._workshopsMap[endpointId][workshopId].r;
  }

  async getUsers() {
    await this._loadUsers();
    return this.users;
  }

  async getUser(userId) {
    await this._loadUsers();
    return this._usersMap[userId];
  }
}

export default DataStore;
