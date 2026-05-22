module.exports = {
  launchImageLibrary: jest.fn(() =>
    Promise.resolve({didCancel: true, assets: []}),
  ),
};
